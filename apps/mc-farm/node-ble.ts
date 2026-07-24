import { Bluetooth } from "webbluetooth";
import { withTimeout, type LogFn } from "@sdcfw/ble-utils";

export interface NodeAdvertisement {
  readonly _serviceUUIDs?: string[];
  readonly _adData?: {
    manufacturerData?: Map<number | string, DataView>;
  };
}

export type ScannedDevice = BluetoothDevice & NodeAdvertisement;

async function scanDevices(
  label: string,
  options: {
    scanTimeSeconds?: number;
    log?: LogFn;
  } = {},
): Promise<ScannedDevice[]> {
  const scanTimeSeconds = options.scanTimeSeconds ?? 10;
  const bluetooth = new Bluetooth({
    allowAllDevices: true,
    scanTime: scanTimeSeconds,
  });
  const discovered = (await withTimeout(
    bluetooth.getDevices(),
    scanTimeSeconds * 1_000 + 5_000,
    label,
  )) as ScannedDevice[];
  const devices = Array.from(
    new Map(discovered.map((device) => [String(device.id).toLowerCase(), device])).values(),
  );
  for (const device of devices) {
    options.log?.(`seen: ${device.name ?? "(no name)"} [${device.id}]`);
  }
  return devices;
}

export async function scanManufacturerDevices(
  manufacturerId: number,
  options: {
    scanTimeSeconds?: number;
    log?: LogFn;
  } = {},
): Promise<ScannedDevice[]> {
  const devices = await scanDevices(
    `scan for manufacturer 0x${manufacturerId.toString(16).padStart(4, "0")}`,
    options,
  );
  return devices.filter((device) => {
    const data = device._adData?.manufacturerData;
    return data?.has(manufacturerId) || data?.has(String(manufacturerId));
  });
}

export async function scanServiceDevices(
  serviceUuid: string,
  options: {
    scanTimeSeconds?: number;
    log?: LogFn;
  } = {},
): Promise<ScannedDevice[]> {
  const devices = await scanDevices(`scan for service ${serviceUuid}`, options);
  const wanted = serviceUuid.toLowerCase();
  return devices.filter((device) =>
    device._serviceUUIDs?.some((advertised) => advertised.toLowerCase() === wanted),
  );
}
