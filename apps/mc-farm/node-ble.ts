import { Bluetooth } from "webbluetooth";
import { withTimeout, type LogFn } from "@sdcfw/ble-utils";

export interface NodeAdvertisement {
  readonly _serviceUUIDs?: string[];
  readonly _adData?: {
    manufacturerData?: Map<number, DataView>;
  };
}

export type ScannedDevice = BluetoothDevice & NodeAdvertisement;

export function advertisedNameMatcher(
  advertisedNameOrId: string,
): (name: string, id: string) => boolean {
  const wanted = advertisedNameOrId.toLowerCase();
  return (name, id) =>
    id.toLowerCase() === wanted || name.toLowerCase().includes(wanted);
}

export async function findAdvertisedDevice(
  advertisedNameOrId: string,
  options: {
    scanTimeSeconds?: number;
    log?: LogFn;
  } = {},
): Promise<ScannedDevice> {
  const scanTimeSeconds = options.scanTimeSeconds ?? 60;
  const matches = advertisedNameMatcher(advertisedNameOrId);
  const bluetooth = new Bluetooth({
    scanTime: scanTimeSeconds,
    deviceFound: (device: ScannedDevice, select: () => void) => {
      const name = String(device.name ?? "");
      const id = String(device.id);
      options.log?.(`seen: ${name || "(no name)"} [${id}]`);
      if (!matches(name, id)) return false;
      select();
      return true;
    },
  });

  try {
    return (await withTimeout(
      bluetooth.requestDevice({ acceptAllDevices: true }),
      scanTimeSeconds * 1_000,
      `scan for "${advertisedNameOrId}"`,
    )) as ScannedDevice;
  } catch (error) {
    try {
      bluetooth.cancelRequest();
    } catch {
      // Best-effort scanner cleanup.
    }
    throw error;
  }
}
