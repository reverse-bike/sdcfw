import { For, Show, createSignal } from "solid-js";
import {
  connect,
  enterDfuMode,
  hex,
  readStandardDeviceInformation,
  type StandardDeviceInformation,
} from "@sdcfw/ble-utils";
import Callout from "./Callout";
import {
  describeDevice,
  errorMessage,
  requestAppDevice,
  requestDfuDevice,
  safeDisconnect,
} from "./mcFarmBle";

type DfuState = "idle" | "arming" | "inspecting";

export default function McFarmDfu() {
  const [state, setState] = createSignal<DfuState>("idle");
  const [log, setLog] = createSignal<string[]>([]);
  const [error, setError] = createSignal("");
  const [armed, setArmed] = createSignal(false);
  const [dfuInfo, setDfuInfo] = createSignal<StandardDeviceInformation[] | null>(null);

  const append = (message: string) => setLog((lines) => [...lines, message]);
  const busy = () => state() !== "idle";

  const reboot = async () => {
    setError("");
    setLog([]);
    setArmed(false);
    setDfuInfo(null);
    setState("arming");

    let server: BluetoothRemoteGATTServer | undefined;
    try {
      append("Select your bike in the Bluetooth device chooser.");
      const device = await requestAppDevice();

      append(`Connecting to ${describeDevice(device)}…`);
      server = await connect(device, { log: append });

      await enterDfuMode(server, { log: append });
      append("The bike should now advertise as a Nordic DFU target.");
      setArmed(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setState("idle");
    }
  };

  const inspect = async () => {
    setError("");
    setDfuInfo(null);
    setState("inspecting");

    let server: BluetoothRemoteGATTServer | undefined;
    try {
      append("Select the DFU target in the Bluetooth device chooser.");
      const device = await requestDfuDevice();

      append(`Connecting to ${describeDevice(device)}…`);
      server = await connect(device, { log: append });

      try {
        setDfuInfo(await readStandardDeviceInformation(server));
        append("Read the bootloader's device information.");
      } catch (cause) {
        setDfuInfo([]);
        append(`Device Information Service unavailable: ${errorMessage(cause)}`);
      }
      append("No firmware data was sent. Power-cycle the bike to leave DFU mode.");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setState("idle");
    }
  };

  return (
    <section class="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 class="text-xl font-bold">Enter DFU mode</h2>
      <p class="mt-2 text-gray-600">
        Reboots the display into the Nordic DFU bootloader, the state firmware updates are sent
        from. Nothing is written to the bike.
      </p>

      <div class="mt-4">
        <Callout type="warning" title="The bike stops working while in DFU mode">
          The display reboots into the bootloader and stays there until you power-cycle the bike.
          Turn the bike off and on again to return to normal operation.
        </Callout>
      </div>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={reboot}
          disabled={busy()}
          class="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-wait disabled:bg-blue-300"
        >
          {state() === "arming" ? "Rebooting…" : "1. Reboot bike into DFU mode"}
        </button>
        <button
          type="button"
          onClick={inspect}
          disabled={busy()}
          class="rounded-lg border border-blue-600 px-5 py-2 font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-wait disabled:border-gray-300 disabled:text-gray-400"
        >
          {state() === "inspecting" ? "Connecting…" : "2. Connect to the DFU target"}
        </button>
      </div>
      <p class="mt-2 text-sm text-gray-500">
        After the reboot the bike appears as a new Bluetooth device, so the browser asks you to pick
        it a second time.
      </p>

      <Show when={armed()}>
        <div
          role="status"
          class="mt-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800"
        >
          <span class="font-semibold">DFU mode requested.</span> Use step 2 to confirm the
          bootloader is advertising.
        </div>
      </Show>
      <Show when={error()}>
        <div
          role="alert"
          class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          <span class="font-semibold">Something went wrong:</span> {error()}
        </div>
      </Show>

      <Show when={log().length > 0}>
        <h3 class="mt-6 mb-2 text-sm font-semibold text-gray-500 uppercase">Log</h3>
        <pre class="max-h-64 overflow-auto rounded-lg bg-gray-900 p-4 font-mono text-xs whitespace-pre-wrap text-gray-100">
          <For each={log()}>{(line) => <div>{line}</div>}</For>
        </pre>
      </Show>

      <Show when={dfuInfo()}>
        {(info) => (
          <>
            <h3 class="mt-6 mb-2 text-xl font-bold">Bootloader device information</h3>
            <Show
              when={info().length > 0}
              fallback={<p class="text-sm text-gray-500">No readable characteristics found.</p>}
            >
              <dl class="divide-y divide-gray-100">
                <For each={info()}>
                  {(entry) => (
                    <div class="grid gap-1 py-3 sm:grid-cols-2 sm:gap-4">
                      <dt class="text-sm font-medium text-gray-500">{entry.label}</dt>
                      <dd class="font-mono text-sm break-all sm:text-right">
                        {entry.text ?? hex(entry.value)}
                      </dd>
                    </div>
                  )}
                </For>
              </dl>
            </Show>
          </>
        )}
      </Show>
    </section>
  );
}
