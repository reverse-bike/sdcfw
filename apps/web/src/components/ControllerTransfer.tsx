import { Show, createSignal } from "solid-js";
import {
  armControllerUpdate,
  connect,
  controllerImageCrc,
  parseDfuPackage,
  transferControllerFirmware,
  validateDfuTransportOptions,
} from "@sdcfw/ble-utils";
import { MissingManifestError, readPackage } from "@sdcfw/firmware-utils";
import Button from "./Button";
import Callout from "./Callout";
import LogPanel from "./LogPanel";
import StatusMessage from "./StatusMessage";
import ToolCard from "./ToolCard";
import ProgressBar from "./ProgressBar";
import {
  describeDevice,
  errorMessage,
  requestAppDevice,
  requestDfuDevice,
  safeDisconnect,
} from "./controllerBle";
import { formatBytes, requestWakeLock } from "./controllerFlash";

type Busy = false | "loading" | "arming" | "transferring";

interface LoadedImage {
  label: string;
  bin: Uint8Array;
  dat: Uint8Array;
  /** Present when the files came from one of our archives */
  reports?: number;
}

/**
 * Transfer tool for firmware that has not been published yet, mirroring
 * the CLI's flash command. Takes an archive or a raw .bin/.dat pair, defaults to a dry
 * run like the CLI does, and exposes the same transport knobs.
 *
 * Nothing here checks compatibility: bring-your-own firmware means the
 * consequences are yours.
 */
export default function ControllerTransfer() {
  const [busy, setBusy] = createSignal<Busy>(false);
  const [log, setLog] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [image, setImage] = createSignal<LoadedImage | null>(null);
  const [execute, setExecute] = createSignal(false);
  const [chunk, setChunk] = createSignal(20);
  const [objectSize, setObjectSize] = createSignal(4096);
  const [prn, setPrn] = createSignal(0);
  const [sent, setSent] = createSignal(0);
  const [total, setTotal] = createSignal(0);

  const append = (message: string) => setLog((lines) => [...lines, message]);

  const loadFiles = async (files: FileList) => {
    setError("");
    setBusy("loading");
    try {
      const list = Array.from(files);
      const zip = list.find((file) => file.name.endsWith(".zip"));
      let loaded: LoadedImage;

      if (zip) {
        const parsed = await readPackage(new Uint8Array(await zip.arrayBuffer())).catch(
          (cause: unknown) => {
            if (cause instanceof MissingManifestError) {
              throw new Error(
                "That zip has no sdcfw.json. Select the .bin and .dat directly instead.",
              );
            }
            throw cause;
          },
        );
        if (parsed.target !== "controller") {
          throw new Error("That archive is display firmware, not motor-controller firmware.");
        }
        loaded = {
          label: `${zip.name} (verified)`,
          bin: parsed.bin,
          dat: parsed.dat,
          reports: parsed.manifest.provides.controllerVersion,
        };
      } else {
        const bin = list.find((file) => file.name.endsWith(".bin"));
        const dat = list.find((file) => file.name.endsWith(".dat"));
        if (!bin || !dat) {
          throw new Error("Select an archive, or both a .bin and its .dat.");
        }
        loaded = {
          label: `${bin.name} + ${dat.name} (unverified)`,
          bin: new Uint8Array(await bin.arrayBuffer()),
          dat: new Uint8Array(await dat.arrayBuffer()),
        };
      }

      const dfu = await parseDfuPackage(loaded.dat, loaded.bin);
      append(`Loaded ${loaded.label}`);
      append(`Firmware ${formatBytes(loaded.bin.length)}, init packet ${loaded.dat.length} B`);
      append(
        `Init packet declares ${dfu.appSize} bytes, class 0x${dfu.fwVersion.toString(16)}${
          dfu.appSize === loaded.bin.length ? "" : " (does not match the binary)"
        }`,
      );
      append(`Staged image CRC: 0x${controllerImageCrc(loaded.bin).toString(16).padStart(8, "0")}`);
      setImage(loaded);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const arm = async () => {
    const loaded = image();
    if (!loaded) return;
    setError("");
    setBusy("arming");
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const device = await requestAppDevice();
      append(`Connecting to ${describeDevice(device)}…`);
      server = await connect(device, { log: append });
      await armControllerUpdate(server, loaded.bin, { log: append });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setBusy(false);
    }
  };

  const transfer = async () => {
    const loaded = image();
    if (!loaded) return;
    setError("");
    setBusy("transferring");
    setSent(0);
    setTotal(loaded.bin.length);
    const wakeLock = await requestWakeLock();
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const transport = validateDfuTransportOptions({
        chunkSize: chunk(),
        objectSize: objectSize(),
        prn: prn(),
      });
      const device = await requestDfuDevice();
      append(`Connecting to ${describeDevice(device)}…`);
      server = await connect(device, { log: append });
      const result = await transferControllerFirmware(server, loaded.dat, loaded.bin, {
        executeFirmware: execute(),
        chunkSize: transport.chunkSize,
        objectSize: transport.objectSize,
        prn: transport.prn,
        log: append,
        // The init packet is 142 bytes; showing it fills the bar before the
        // firmware has started, and a dry run then stops there looking done.
        onProgress: (progress) => {
          if (progress.phase !== "firmware") return;
          setSent(progress.bytesSent);
          setTotal(progress.totalBytes);
        },
      });
      append(
        result.firmwareTransferred
          ? "Firmware sent. The display will program the controller."
          : "Dry run finished: the init packet was accepted, no firmware was sent.",
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      wakeLock.release();
      safeDisconnect(server);
      setBusy(false);
    }
  };

  const numberField = (
    label: string,
    value: () => number,
    set: (next: number) => void,
    hint: string,
  ) => (
    <label class="block">
      <span class="text-sm font-medium text-gray-700">{label}</span>
      <input
        type="number"
        min="0"
        value={value()}
        disabled={busy() !== false}
        onInput={(event) => set(Number(event.currentTarget.value))}
        class="mt-1 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <span class="text-xs text-gray-500">{hint}</span>
    </label>
  );

  return (
    <ToolCard
      title="Transfer your own firmware"
      description="For firmware that is not published yet. Does the same thing as the command line tool, including its dry run default."
    >
      <Callout type="warning" title="No compatibility checks here">
        Published releases are checked against what your bike reports. Files you bring are not.
        Sending controller firmware meant for a different bike is not something you can undo.
      </Callout>

      <div class="mt-5">
        <label class="block text-sm font-medium text-gray-700">
          Archive, or a .bin and .dat pair
          <input
            type="file"
            multiple
            accept=".zip,.bin,.dat"
            disabled={busy() !== false}
            onChange={(event) => {
              const files = event.currentTarget.files;
              if (files && files.length > 0) void loadFiles(files);
            }}
            class="mt-1 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
          />
        </label>
      </div>

      <Show when={image()}>
        {(loaded) => (
          <>
            <div class="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
              <div class="font-medium">{loaded().label}</div>
              <Show when={loaded().reports !== undefined}>
                <div class="text-gray-600">Reports controller version {loaded().reports}</div>
              </Show>
            </div>

            <div class="mt-5 grid gap-4 sm:grid-cols-3">
              {numberField("Chunk size", chunk, setChunk, "bytes per BLE write")}
              {numberField("Object size", objectSize, setObjectSize, "bytes per DFU object")}
              {numberField("PRN", prn, setPrn, "0 disables receipts")}
            </div>

            <label class="mt-4 flex items-start gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={execute()}
                disabled={busy() !== false}
                onChange={(event) => setExecute(event.currentTarget.checked)}
                class="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                Actually send the firmware. Left off, this connects and submits the init packet
                only, which proves the package is accepted without writing anything.
              </span>
            </label>

            <div class="mt-5 grid gap-3 sm:grid-cols-2">
              <Button onClick={arm} disabled={busy() !== false}>
                {busy() === "arming" ? "Arming…" : "1. Arm and reboot into DFU"}
              </Button>
              <Button onClick={transfer} disabled={busy() !== false} variant="secondary">
                {busy() === "transferring"
                  ? "Transferring…"
                  : execute()
                    ? "2. Connect and flash"
                    : "2. Connect and dry run"}
              </Button>
            </div>
            <p class="mt-2 text-sm text-gray-500">
              Step 2 resumes automatically if a transfer was interrupted: the bootloader reports how
              far it got and only the remainder is sent.
            </p>
          </>
        )}
      </Show>

      <Show when={total() > 0}>
        <div class="mt-4">
          <ProgressBar
            percent={percentOf(sent(), total())}
            message={`${formatBytes(sent())} of ${formatBytes(total())}`}
          />
        </div>
      </Show>

      <Show when={error()}>
        <StatusMessage tone="error" title="Something went wrong">
          {error()}
        </StatusMessage>
      </Show>

      <LogPanel lines={log()} label="Log" open />
    </ToolCard>
  );
}

function percentOf(sent: number, total: number): number {
  return total === 0 ? 0 : Math.round((sent / total) * 100);
}
