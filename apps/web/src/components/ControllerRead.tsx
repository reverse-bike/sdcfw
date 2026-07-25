import { For, Show, createSignal } from "solid-js";
import { connect, hex, readVersionInfo, type ModuleVersionInfo } from "@sdcfw/ble-utils";
import Button from "./Button";
import StatusMessage from "./StatusMessage";
import ToolCard from "./ToolCard";
import { describeDevice, errorMessage, requestAppDevice, safeDisconnect } from "./controllerBle";

type ReadState = "idle" | "selecting" | "connecting" | "reading";

export default function ControllerRead() {
  const [state, setState] = createSignal<ReadState>("idle");
  const [status, setStatus] = createSignal("");
  const [error, setError] = createSignal("");
  const [info, setInfo] = createSignal<ModuleVersionInfo | null>(null);

  const read = async () => {
    setError("");
    setInfo(null);
    setState("selecting");
    setStatus("Select your bike in the Bluetooth device chooser.");

    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const device = await requestAppDevice();

      setState("connecting");
      setStatus(`Connecting to ${describeDevice(device)}…`);
      server = await connect(device, {
        log: setStatus,
      });

      setState("reading");
      setStatus("Reading firmware and device information…");
      setInfo(await readVersionInfo(server));
      setStatus("");
    } catch (cause) {
      setError(errorMessage(cause));
      setStatus("");
    } finally {
      safeDisconnect(server);
      setState("idle");
    }
  };

  const details = () => {
    const value = info();
    if (!value) return [];
    return [
      ["Model", value.model],
      ["Serial Number", value.serialNumber],
      ["Manufacturer", value.manufacturerName],
      ["Hardware Revision", value.hardwareRevision],
      ["nRF Version", value.nrfVersion],
      ["Software Revision", value.softwareRevision],
      ["nRF Bootloader Version", String(value.nrfBootloaderVersion)],
      ["Firmware Variant", String(value.firmwareVariant)],
      ["STM Firmware Version", String(value.stmVersion)],
      ["Controller Firmware Version", String(value.controllerVersion)],
      [
        "Controller Variant",
        value.controllerVariant ? String(value.controllerVariant) : "unknown (0)",
      ],
      ["Battery Firmware Version", String(value.batteryVersion)],
    ].filter((entry): entry is [string, string] => entry[1] !== undefined);
  };

  return (
    <>
      <ToolCard
        title="Read firmware info"
        description="Connect to your bike over Bluetooth and read its current firmware versions. This does not modify the bike."
      >
        <Button onClick={read} disabled={state() !== "idle"}>
          {state() === "idle" ? "Choose a Bluetooth device" : "Reading…"}
        </Button>
        <p class="mt-2 text-sm text-gray-500">
          Your browser will show discoverable bikes with compatible manufacturer data.
        </p>

        <Show when={status()}>
          <StatusMessage tone="info" title="Status">
            {status()}
          </StatusMessage>
        </Show>
        <Show when={error()}>
          <StatusMessage tone="error" title="Could not read the bike">
            {error()}
          </StatusMessage>
        </Show>
      </ToolCard>

      <Show when={info()}>
        {(value) => (
          <ToolCard title="Firmware and device information">
            <dl class="divide-y divide-gray-100">
              <For each={details()}>
                {([label, bytes]) => (
                  <div class="grid gap-1 py-3 sm:grid-cols-2 sm:gap-4">
                    <dt class="text-sm font-medium text-gray-500">{label}</dt>
                    <dd class="font-mono text-sm break-all sm:text-right">{bytes}</dd>
                  </div>
                )}
              </For>
            </dl>

            <Show when={Object.entries(value().additionalDeviceInfo).length > 0}>
              <h3 class="mt-7 mb-4 text-lg font-bold">Additional BLE information</h3>
              <dl class="divide-y divide-gray-100">
                <For each={Object.entries(value().additionalDeviceInfo)}>
                  {([label, bytes]) => (
                    <div class="grid gap-1 py-3 sm:grid-cols-2 sm:gap-4">
                      <dt class="text-sm font-medium text-gray-500">{label}</dt>
                      <dd class="font-mono text-sm break-all sm:text-right">{hex(bytes)}</dd>
                    </div>
                  )}
                </For>
              </dl>
            </Show>
          </ToolCard>
        )}
      </Show>
    </>
  );
}
