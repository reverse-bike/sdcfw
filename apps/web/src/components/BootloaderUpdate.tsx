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
        setStatus(
          "Update mode requested. Continue with Run dry run and select DfuTarg in the Bluetooth chooser.",
        );
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
            "Dry run passed. No firmware image was sent. To install, tick the confirmation box and select Install bootloader. A passed dry run does not guarantee installation will succeed.",
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
        Updates the display's nRF bootloader over Bluetooth, not its display application or motor
        controller firmware. You need a compatible, original bootloader update package. No USB probe
        is needed to perform the update.
      </p>
      <Callout type="warning" title="A failed bootloader update can require wired recovery">
        Use an original package known to match your display. Package checks do not establish bike
        compatibility. Keep the bike powered and this tab open and in the foreground throughout
        installation. Do not turn the bike off while firmware is being sent or installed.
      </Callout>
      <div class="mt-5 mb-5 text-sm text-gray-600 dark:text-gray-400">
        <h3 class="font-semibold text-gray-900 dark:text-gray-100 mb-2">Before you start</h3>
        <p>
          Turn the bike off and on, then wait for its normal screen. This clears any previous
          controller-update mode. Close other apps connected to the bike and keep other bikes in
          update mode switched off, so you can identify the right Bluetooth device.
        </p>
      </div>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Choose your bootloader package
        <input
          class="mt-2 block w-full rounded-lg text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 dark:file:bg-blue-950 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:focus:ring-blue-800 disabled:opacity-50 disabled:cursor-not-allowed disabled:file:cursor-not-allowed"
          type="file"
          multiple
          accept=".zip,.bin,.dat"
          aria-describedby="bootloader-package-help"
          disabled={busy()}
          onChange={(event) => {
            const files = event.currentTarget.files;
            if (files?.length) void load(files);
          }}
        />
      </label>
      <p id="bootloader-package-help" class="mt-2 text-sm text-gray-500">
        Select the original Nordic bootloader ZIP, without extracting it. Alternatively, select its
        .bin and .dat files together. A full display backup or controller firmware ZIP will not
        work. Choosing files only checks the package; it does not connect to or change the bike.
      </p>
      <Show when={pkg()}>
        <p class="mt-3 break-all text-sm">Package loaded: {label()}</p>
        <div class="mt-5">
          <h3 class="font-semibold mb-2">1. Put the bike in update mode</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
            Select your bike (usually SUPER73) in the Bluetooth chooser. We read its current
            version, then restart the display into update mode, also called DFU. No firmware is sent
            yet.
          </p>
          <Button disabled={busy()} onClick={prepare}>
            Enter update mode
          </Button>
        </div>
        <div class="mt-5">
          <h3 class="font-semibold mb-2">2. Check that the bike accepts the package</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
            After the display restarts, select DfuTarg in the next Bluetooth chooser. This is your
            bike under its update-mode name. The dry run sends only the signed package information
            for the bike to validate, not the firmware image.
          </p>
          <Button
            disabled={busy() || !prepared()}
            onClick={() => transfer(false)}
            variant="secondary"
          >
            Run dry run
          </Button>
        </div>
        <p class="mt-2 text-sm text-gray-500">
          If you stop after the dry run, turn the bike off and on to return to normal operation. To
          install later, start again at step 1. A passed dry run does not guarantee installation
          will succeed.
        </p>
        <h3 class="mt-5 font-semibold mb-2">3. Install the bootloader</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Installation becomes available after the dry run passes. Confirm below, then select the
          same DfuTarg again. This step sends and installs the firmware. Keep power on until the
          display returns to its normal screen, then check the version below.
        </p>
        <label class="flex items-start gap-2 text-sm">
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
            Install bootloader
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
      <div class="mt-6 border-t border-gray-200 dark:border-gray-800 pt-5">
        <h3 class="font-semibold mb-2">Check the bootloader version</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">
          With the bike showing its normal screen, select it by its normal Bluetooth name, not
          DfuTarg. You can check before or after an update, without loading a package. This reads
          the current version and compares it with the expected version below; it does not install
          anything.
        </p>
        <p class="mt-2 text-sm text-gray-500">
          For the NRFBL-6 package, leave the expected version at 6. Its signed package information
          contains a separate version field of 5; that is not the version the bike should report
          after installation.
        </p>
        <div class="mt-5 flex flex-wrap items-end gap-3">
          <label class="block text-sm">
            Expected bootloader version
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
            Read bootloader version
          </Button>
        </div>
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
