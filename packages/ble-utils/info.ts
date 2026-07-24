import {
  APP_RX_CHAR,
  APP_SERVICE,
  APP_TX_CHAR,
  DIS_SERVICE,
  HISTORY_SELECT_CHAR,
} from "./constants.js";
import { authenticate } from "./auth.js";
import { bytesOf, withTimeout } from "./util.js";

const DIS_LABELS: Record<string, string> = {
  "2a23": "System ID",
  "2a24": "Model",
  "2a25": "Serial Number",
  "2a26": "nRF Version",
  "2a27": "Hardware Revision",
  "2a28": "Software Revision",
  "2a29": "Manufacturer Name",
};

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
  const value = manufacturerData.get(0x020f);
  if (!value) return undefined;
  const bytes = bytesOf(value);
  if (bytes.length < 8) return undefined;
  return Array.from(bytes.subarray(0, 8), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readVersionInfo(
  server: BluetoothRemoteGATTServer,
  options: {
    advertisedSerial?: string;
    authKey?: Uint8Array;
  } = {},
): Promise<ModuleVersionInfo> {
  const disValues = new Map<string, Uint8Array>();
  const dis = await withTimeout(
    server.getPrimaryService(DIS_SERVICE),
    10_000,
    "get Device Information Service",
  );
  for (const characteristic of await dis.getCharacteristics()) {
    if (!characteristic.properties.read) continue;
    try {
      const id = shortUuid(characteristic.uuid) ?? characteristic.uuid;
      disValues.set(id, bytesOf(await characteristic.readValue()));
    } catch {
      // Optional DIS characteristics vary between display firmware versions.
    }
  }

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
    if (!(id in DIS_LABELS) || id === "2a23") {
      additionalDeviceInfo[DIS_LABELS[id] ?? id] = bytes;
    }
  }

  const value = (id: string): string | undefined => {
    const bytes = disValues.get(id);
    return bytes ? utf8(bytes) : undefined;
  };

  return {
    model: value("2a24"),
    serialNumber: value("2a25") ?? options.advertisedSerial,
    manufacturerName: value("2a29"),
    hardwareRevision: value("2a27"),
    nrfVersion: value("2a26"),
    softwareRevision: value("2a28"),
    nrfBootloaderVersion: fcfc[7] ?? 0,
    firmwareVariant: fcfc[8] ?? 0,
    stmVersion: u24be(fcfc, 2),
    controllerVersion: u32be(fafa, 2),
    controllerVariant: (fcfc[5] ?? 0) | ((fcfc[6] ?? 0) << 8),
    batteryVersion: u32be(fafa, 6),
    additionalDeviceInfo,
  };
}
