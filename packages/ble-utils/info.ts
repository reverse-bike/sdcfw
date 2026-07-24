import {
  APP_RX_CHAR,
  APP_SERVICE,
  APP_TX_CHAR,
  APP_MANUFACTURER_ID,
  DIS_SERVICE,
  HISTORY_SELECT_CHAR,
} from "./constants.js";
import { authenticate } from "./auth.js";
import { bytesOf, withTimeout } from "./util.js";

const DIS_LABELS: Record<string, string> = {
  "2a23": "System ID",
  "2a24": "Model Number",
  "2a25": "Serial Number",
  "2a26": "Firmware Revision",
  "2a27": "Hardware Revision",
  "2a28": "Software Revision",
  "2a29": "Manufacturer Name",
  "2a2a": "IEEE Regulatory Certification Data",
  "2a50": "PnP ID",
  "2a51": "UDI for Medical Devices",
};

const DIS_TEXT_IDS = new Set(["2a24", "2a25", "2a26", "2a27", "2a28", "2a29", "2a51"]);

export interface StandardDeviceInformation {
  uuid: string;
  label: string;
  value: Uint8Array;
  text?: string;
}

export interface ModuleVersionInfo {
  model?: string;
  serialNumber?: string;
  manufacturerName?: string;
  hardwareRevision?: string;
  nrfVersion?: string;
  softwareRevision?: string;
  nrfBootloaderVersion: number;
  firmwareVariant: number;
  stmVersion: number;
  controllerVersion: number;
  controllerVariant: number;
  batteryVersion: number;
  additionalDeviceInfo: Record<string, Uint8Array>;
}

function shortUuid(uuid: string): string | undefined {
  return uuid.toLowerCase().match(/^0000([0-9a-f]{4})-/)?.[1];
}

function utf8(bytes: Uint8Array): string {
  const text = new TextDecoder().decode(bytes);
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0) end -= 1;
  return text.slice(0, end);
}

function u24be(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 16) | ((bytes[offset + 1] ?? 0) << 8) | (bytes[offset + 2] ?? 0);
}

function u32be(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

export function serialFromManufacturerData(
  manufacturerData?: Map<number, DataView>,
): string | undefined {
  if (!manufacturerData) return undefined;
  const value = manufacturerData.get(APP_MANUFACTURER_ID);
  if (!value) return undefined;
  const bytes = bytesOf(value);
  if (bytes.length < 8) return undefined;
  return Array.from(bytes.subarray(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readStandardDeviceInformation(
  server: BluetoothRemoteGATTServer,
): Promise<StandardDeviceInformation[]> {
  const values: StandardDeviceInformation[] = [];
  const dis = await withTimeout(
    server.getPrimaryService(DIS_SERVICE),
    10_000,
    "get Device Information Service",
  );
  for (const characteristic of await dis.getCharacteristics()) {
    if (!characteristic.properties.read) continue;
    try {
      const uuid = shortUuid(characteristic.uuid) ?? characteristic.uuid;
      const value = bytesOf(await characteristic.readValue());
      const text = DIS_TEXT_IDS.has(uuid) ? utf8(value) : undefined;
      values.push({
        uuid,
        label: DIS_LABELS[uuid] ?? uuid,
        value,
        ...(text === undefined ? {} : { text }),
      });
    } catch {
      // Optional DIS characteristics may be present but unreadable.
    }
  }
  return values;
}

export async function readVersionInfo(
  server: BluetoothRemoteGATTServer,
  options: {
    advertisedSerial?: string;
    authKey?: Uint8Array;
  } = {},
): Promise<ModuleVersionInfo> {
  const disValues = new Map(
    (await readStandardDeviceInformation(server)).map(({ uuid, value }) => [uuid, value]),
  );

  if (!(await authenticate(server, options.authKey))) {
    throw new Error("application authentication failed");
  }

  const appService = await server.getPrimaryService(APP_SERVICE);
  const select = await appService.getCharacteristic(HISTORY_SELECT_CHAR);
  const tx = await appService.getCharacteristic(APP_TX_CHAR);
  const rx = await appService.getCharacteristic(APP_RX_CHAR);

  async function readRegistry(id: number): Promise<Uint8Array> {
    await select.writeValueWithResponse(new Uint8Array([id >>> 8, id & 0xff]));
    for (const characteristic of [rx, tx]) {
      try {
        const bytes = bytesOf(await characteristic.readValue());
        if (bytes.length === 10 && bytes[0] === id >>> 8 && bytes[1] === (id & 0xff)) {
          return bytes;
        }
      } catch {
        // Try the other characteristic.
      }
    }
    throw new Error(`registry ${id.toString(16).toUpperCase()} was not returned`);
  }

  const fcfc = await readRegistry(0xfcfc);
  const fafa = await readRegistry(0xfafa);
  const additionalDeviceInfo: Record<string, Uint8Array> = {};
  for (const [id, bytes] of disValues) {
    if (!["2a24", "2a25", "2a26", "2a27", "2a28", "2a29"].includes(id)) {
      additionalDeviceInfo[DIS_LABELS[id] ?? id] = bytes;
    }
  }

  const value = (id: string): string | undefined => {
    const bytes = disValues.get(id);
    return bytes ? utf8(bytes) : undefined;
  };

  const model = value("2a24");
  const serialNumber = value("2a25") ?? options.advertisedSerial;
  const manufacturerName = value("2a29");
  const hardwareRevision = value("2a27");
  const nrfVersion = value("2a26");
  const softwareRevision = value("2a28");

  return {
    ...(model === undefined ? {} : { model }),
    ...(serialNumber === undefined ? {} : { serialNumber }),
    ...(manufacturerName === undefined ? {} : { manufacturerName }),
    ...(hardwareRevision === undefined ? {} : { hardwareRevision }),
    ...(nrfVersion === undefined ? {} : { nrfVersion }),
    ...(softwareRevision === undefined ? {} : { softwareRevision }),
    nrfBootloaderVersion: fcfc[7] ?? 0,
    firmwareVariant: fcfc[8] ?? 0,
    stmVersion: u24be(fcfc, 2),
    controllerVersion: u32be(fafa, 2),
    controllerVariant: (fcfc[5] ?? 0) | ((fcfc[6] ?? 0) << 8),
    batteryVersion: u32be(fafa, 6),
    additionalDeviceInfo,
  };
}
