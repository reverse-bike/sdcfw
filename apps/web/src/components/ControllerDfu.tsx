import { For, Show, createSignal } from "solid-js";
import {
  connect,
  enterDfuMode,
  hex,
  readStandardDeviceInformation,
  type StandardDeviceInformation,
} from "@sdcfw/ble-utils";
import Button from "./Button";
import Callout from "./Callout";
import LogPanel from "./LogPanel";
import StatusMessage from "./StatusMessage";
import ToolCard from "./ToolCard";
import {
  describeDevice,
  errorMessage,
  requestAppDevice,
  requestDfuDevice,
  safeDisconnect,
} from "./controllerBle";

type DfuState = "idle" | "arming" | "inspecting";

export default function ControllerDfu() {
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
    <ToolCard
      title="Enter DFU mode"
      description="Reboots the display into the Nordic DFU bootloader, the state firmware updates are sent from. Nothing is written to the bike."
    >
      <Callout type="warning" title="The bike stops working while in DFU mode">
        The display reboots into the bootloader and stays there until you power-cycle the bike. Turn
        the bike off and on again to return to normal operation.
      </Callout>

      <div class="mt-5 grid gap-3 sm:grid-cols-2">
        <Button onClick={reboot} disabled={busy()}>
          {state() === "arming" ? "Rebooting…" : "1. Reboot bike into DFU mode"}
        </Button>
        <Button onClick={inspect} disabled={busy()} variant="secondary">
          {state() === "inspecting" ? "Connecting…" : "2. Connect to the DFU target"}
        </Button>
      </div>
      <p class="mt-2 text-sm text-gray-500">
        After the reboot the bike appears as a new Bluetooth device, so the browser asks you to pick
        it a second time.
      </p>

      <Show when={armed()}>
        <StatusMessage tone="success" title="DFU mode requested">
          Use step 2 to confirm the bootloader is advertising.
        </StatusMessage>
      </Show>
      <Show when={error()}>
        <StatusMessage tone="error" title="Something went wrong">
          {error()}
        </StatusMessage>
      </Show>

      <LogPanel lines={log()} label="Log" />

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
    </ToolCard>
  );
}
