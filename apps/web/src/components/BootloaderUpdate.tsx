import { Show, createSignal } from "solid-js";
import {
  connect,
  enterDfuMode,
  parseDfuPackage,
  readVersionInfo,
  transferDfuFirmware,
  validateBootloaderPackage,
  type DfuPackage,
} from "@sdcfw/ble-utils";
import { readNordicBootloaderPackage } from "@sdcfw/firmware-utils";
import Button from "./Button";
import Callout from "./Callout";
import LogPanel from "./LogPanel";
import ProgressBar from "./ProgressBar";
import StatusMessage from "./StatusMessage";
import {
  describeDevice,
  errorMessage,
  requestAppDevice,
  requestDfuDevice,
  safeDisconnect,
} from "./controllerBle";
import { requestWakeLock } from "./controllerFlash";

export default function BootloaderUpdate() {
  const [busy, setBusy] = createSignal(false);
  const [log, setLog] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [status, setStatus] = createSignal("");
  const [pkg, setPkg] = createSignal<DfuPackage>();
  const [label, setLabel] = createSignal("");
  const [prepared, setPrepared] = createSignal(false);
  const [accepted, setAccepted] = createSignal(false);
  const [confirmed, setConfirmed] = createSignal(false);
  const [progress, setProgress] = createSignal(0);
  const [expected, setExpected] = createSignal(6);
  const [before, setBefore] = createSignal<number>();
  let appDevice: BluetoothDevice | undefined;
  let dfuDeviceId: string | undefined;
  const append = (message: string) => setLog((lines) => [...lines, message]);

  const run = async (operation: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await operation();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const load = (files: FileList) =>
    // oxlint-disable-next-line solid/reactivity -- run invokes this callback once from a file-selection event.
    run(async () => {
      setPkg(undefined);
      setPrepared(false);
      setAccepted(false);
      setConfirmed(false);
      setProgress(0);
      appDevice = undefined;
      dfuDeviceId = undefined;
      setBefore(undefined);
      const list = Array.from(files);
      const zip = list.find((file) => file.name.toLowerCase().endsWith(".zip"));
      let image: { dat: Uint8Array; bin: Uint8Array };
      if (zip && list.length === 1) {
        image = readNordicBootloaderPackage(new Uint8Array(await zip.arrayBuffer()));
      } else {
        const bin = list.find((file) => file.name.toLowerCase().endsWith(".bin"));
        const dat = list.find((file) => file.name.toLowerCase().endsWith(".dat"));
        if (zip || list.length !== 2 || !bin || !dat) {
          throw new Error("Select one official bootloader ZIP, or exactly one .bin and its .dat.");
        }
        image = {
          bin: new Uint8Array(await bin.arrayBuffer()),
          dat: new Uint8Array(await dat.arrayBuffer()),
        };
      }
      const parsed = await parseDfuPackage(image.dat, image.bin);
      validateBootloaderPackage(parsed);
      setPkg(parsed);
      setLabel(list.map((file) => file.name).join(" + "));
      append(`Loaded ${label()}: bootloader ${parsed.blSize} bytes; SHA-256 matches.`);
      append(
        `Signed firmware field: ${parsed.fwVersion}. This is not necessarily the reported bootloader version.`,
      );
      append("Signature authenticity will be checked by the bike during the dry run.");
    });

  const prepare = () =>
    // oxlint-disable-next-line solid/reactivity -- run invokes this callback once from a button click.
    run(async () => {
      if (!pkg()) return;
      setPrepared(false);
      setAccepted(false);
      setConfirmed(false);
      dfuDeviceId = undefined;
      let server: BluetoothRemoteGATTServer | undefined;
      try {
        appDevice = await requestAppDevice();
        append(`Connecting to ${describeDevice(appDevice)}…`);
        server = await connect(appDevice, { log: append });
        const info = await readVersionInfo(server);
        setBefore(info.nrfBootloaderVersion);
        append(
          `Display ${info.nrfVersion}; hardware ${info.hardwareRevision}; bootloader ${info.nrfBootloaderVersion}; controller ${info.controllerVersion}, variant ${info.controllerVariant}.`,
        );
        append("Requesting internal nRF DFU. No F0CC controller staging command is sent.");
        await enterDfuMode(server, { log: append });
        setPrepared(true);
        setStatus("DFU requested. Select this bike's DfuTarg for the dry run.");
      } finally {
        safeDisconnect(server);
      }
    });

  const transfer = (executeFirmware: boolean) =>
    // oxlint-disable-next-line solid/reactivity -- run invokes this callback once from a button click.
    run(async () => {
      const image = pkg();
      if (!image || !prepared()) return;
      if (executeFirmware && (!accepted() || !confirmed())) return;
      validateBootloaderPackage(image);
      setProgress(0);
      let server: BluetoothRemoteGATTServer | undefined;
      // Open the chooser directly from the click, before awaiting a wake lock.
      const target = await requestDfuDevice();
      if (dfuDeviceId && target.id !== dfuDeviceId) {
        throw new Error("Select the same DFU device used for the dry run.");
      }
      const wakeLock = await requestWakeLock();
      try {
        append(`Connecting to ${describeDevice(target)}…`);
        server = await connect(target, { log: append });
        if (!executeFirmware) setAccepted(false);
        await transferDfuFirmware(server, image.dat, image.bin, {
          executeFirmware,
          log: append,
          onProgress: (value) => {
            if (value.phase === "firmware")
              setProgress(Math.round((100 * value.bytesSent) / value.totalBytes));
          },
        });
        if (executeFirmware) {
          setStatus(
            "Firmware sent, not yet verified. Leave power on, wait for the normal screen, then read the bootloader version below.",
          );
        } else {
          dfuDeviceId = target.id;
          setAccepted(true);
          setStatus(
            "Dry run accepted. No firmware image was sent. This does not prove installation will succeed.",
          );
        }
      } catch (cause) {
        if (executeFirmware)
          append(
            "Transfer did not finish cleanly. Leave power on and check the reported version after the normal screen returns before retrying.",
          );
        throw cause;
      } finally {
        if (executeFirmware) {
          setAccepted(false);
          setConfirmed(false);
          setPrepared(false);
        }
        safeDisconnect(server);
        wakeLock.release();
      }
    });

  const verify = () =>
    // oxlint-disable-next-line solid/reactivity -- run invokes this callback once from a button click.
    run(async () => {
      if (!Number.isInteger(expected()) || expected() < 1 || expected() > 31) {
        throw new Error("Expected reported bootloader version must be between 1 and 31.");
      }
      let server: BluetoothRemoteGATTServer | undefined;
      try {
        const device = await requestAppDevice();
        if (appDevice && device.id !== appDevice.id)
          throw new Error("Select the same bike used in step 1.");
        server = await connect(device, { log: append });
        setPrepared(false);
        setAccepted(false);
        setConfirmed(false);
        const info = await readVersionInfo(server);
        append(
          `Reported bootloader: ${info.nrfBootloaderVersion}; before update: ${before() ?? "unknown"}.`,
        );
        if (info.nrfBootloaderVersion !== expected()) {
          throw new Error(
            `Bike reports bootloader ${info.nrfBootloaderVersion}, expected ${expected()}. Update is not verified.`,
          );
        }
        setStatus(`Verified: the bike reports bootloader ${info.nrfBootloaderVersion}.`);
      } finally {
        safeDisconnect(server);
      }
    });

  return (
    <section class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-6 mb-6">
      <h2 class="text-2xl font-semibold mb-4">Update nRF bootloader over Bluetooth</h2>
      <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
        An advanced, signed bootloader-only update. No USB probe is needed for this tool.
      </p>
      <Callout type="warning" title="A failed bootloader update can require wired recovery">
        Use an original package known to match your display. Package checks do not establish bike
        compatibility. Keep the bike powered and this tab open throughout installation. Before step
        1, power-cycle the bike and wait for its normal screen to clear any controller-update mode.
        Keep other DFU bikes off.
      </Callout>
      <label class="mt-5 block text-sm">
        Official Nordic bootloader ZIP, or its .bin and .dat files
        <input
          class="mt-2 block w-full"
          type="file"
          multiple
          accept=".zip,.bin,.dat"
          disabled={busy()}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files?.length) void load(files);
          }}
        />
      </label>
      <Show when={pkg()}>
        <p class="mt-3 break-all text-sm">{label()}</p>
        <div class="mt-5 grid gap-3 sm:grid-cols-2">
          <Button disabled={busy()} onClick={prepare}>
            1. Read bike and enter DFU
          </Button>
          <Button
            disabled={busy() || !prepared()}
            onClick={() => transfer(false)}
            variant="secondary"
          >
            2. Connect and dry run
          </Button>
        </div>
        <p class="mt-2 text-sm text-gray-500">
          The dry run submits the signed init packet for validation, but sends no firmware image. It
          can change DFU state. Power-cycle to exit after a dry run if you are not proceeding.
        </p>
        <label class="mt-5 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={confirmed()}
            disabled={busy() || !accepted()}
            onChange={(event) => setConfirmed(event.currentTarget.checked)}
          />
          <span>
            I have confirmed this package matches my display and understand that installing it
            replaces the nRF bootloader.
          </span>
        </label>
        <div class="mt-3">
          <Button disabled={busy() || !accepted() || !confirmed()} onClick={() => transfer(true)}>
            3. Install bootloader
          </Button>
        </div>
        <Show when={progress() > 0}>
          <div class="mt-4">
            <ProgressBar
              percent={progress()}
              message="Firmware transfer (installation must still be verified)"
            />
          </div>
        </Show>
      </Show>
      <div class="mt-5 flex flex-wrap items-end gap-3">
        <label class="block text-sm">
          Expected reported bootloader version
          <input
            class="mt-1 block w-24 rounded border p-2"
            type="number"
            min="1"
            max="31"
            value={expected()}
            disabled={busy()}
            onInput={(event) => setExpected(Number(event.currentTarget.value))}
          />
        </label>
        <Button disabled={busy()} onClick={verify} variant="secondary">
          4. Read and verify version
        </Button>
      </div>
      <Show when={busy()}>
        <p class="mt-3 text-sm" role="status">
          Working… follow the Bluetooth prompts and keep the bike powered.
        </p>
      </Show>
      <Show when={status()}>
        <StatusMessage tone="info" title="Update status">
          {status()}
        </StatusMessage>
      </Show>
      <Show when={error()}>
        <StatusMessage tone="error" title="Update not verified">
          {error()}
        </StatusMessage>
      </Show>
      <LogPanel lines={log()} label="Bootloader update log" open />
    </section>
  );
}
