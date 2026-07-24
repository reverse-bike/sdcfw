import { For, Show, createSignal } from "solid-js";
import { connect, hex, readVersionInfo, type ModuleVersionInfo } from "@sdcfw/ble-utils";
import { describeDevice, errorMessage, requestAppDevice, safeDisconnect } from "./mcFarmBle";

type ReadState = "idle" | "selecting" | "connecting" | "reading";

export default function McFarmRead() {
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
      <section class="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <h2 class="text-xl font-bold">Read firmware info</h2>
        <p class="mt-2 mb-5 text-gray-600">
          Connect to your bike over Bluetooth and read its current firmware versions. This does not
          modify the bike.
        </p>

        <button
          type="button"
          onClick={read}
          disabled={state() !== "idle"}
          class="w-full rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-300 focus:outline-none disabled:cursor-wait disabled:bg-blue-300"
        >
          {state() === "idle" ? "Choose a Bluetooth device" : "Reading…"}
        </button>
        <p class="mt-2 text-sm text-gray-500">
          Your browser will show discoverable bikes with compatible manufacturer data.
        </p>

        <Show when={status()}>
          <div
            role="status"
            class="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800"
          >
            <span class="font-semibold">Status:</span> {status()}
          </div>
        </Show>
        <Show when={error()}>
          <div
            role="alert"
            class="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
            <span class="font-semibold">Could not read the bike:</span> {error()}
          </div>
        </Show>
      </section>

      <Show when={info()}>
        {(value) => (
          <section class="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 class="mb-4 text-xl font-bold">Firmware and device information</h2>
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
              <h2 class="mt-7 mb-4 text-xl font-bold">Additional BLE information</h2>
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
          </section>
        )}
      </Show>
    </>
  );
}
