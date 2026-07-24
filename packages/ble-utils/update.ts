import {
  APP_RX_CHAR,
  APP_SERVICE,
  DFU_BUTTONLESS,
  DFU_SERVICE,
} from "./constants.js";
import { crc32Ieee, deviceImageCrc } from "./crc.js";
import { DfuClient } from "./dfu.js";
import { stagedImage } from "./package.js";
import { hex, sleep, withTimeout, type LogFn } from "./util.js";

export function controllerImageCrc(bin: Uint8Array): number {
  return deviceImageCrc(stagedImage(bin));
}

export function createArmPacket(crc: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xf0,
    0xcc,
    0x80,
    (crc >>> 24) & 0xff,
    (crc >>> 16) & 0xff,
    (crc >>> 8) & 0xff,
    crc & 0xff,
    0x01,
    0x00,
    0x00,
  ]);
}

export async function armControllerUpdate(
  server: BluetoothRemoteGATTServer,
  bin: Uint8Array,
  options: {
    eraseWaitMs?: number;
    enterDfu?: boolean;
    rebootSettleMs?: number;
    log?: LogFn;
  } = {},
): Promise<number> {
  const log = options.log ?? (() => {});
  const crc = controllerImageCrc(bin);
  const packet = createArmPacket(crc);
  log(`controller image CRC: 0x${crc.toString(16).padStart(8, "0")}`);
  log(`F0CC arm packet: ${hex(packet)}`);

  const appService = await withTimeout(
    server.getPrimaryService(APP_SERVICE),
    10_000,
    "get application service",
  );
  const rx = await appService.getCharacteristic(APP_RX_CHAR);
  await withTimeout(
    rx.writeValueWithResponse(packet),
    15_000,
    "write F0CC arm packet",
  );

  if (options.enterDfu ?? true) {
    const eraseWaitMs = options.eraseWaitMs ?? 8_000;
    log(`external staging area armed; waiting ${eraseWaitMs / 1000}s`);
    await sleep(eraseWaitMs);
    log("requesting buttonless DFU reboot");
    try {
      const dfuService = await withTimeout(
        server.getPrimaryService(DFU_SERVICE),
        10_000,
        "get buttonless DFU service",
      );
      const buttonless = await dfuService.getCharacteristic(DFU_BUTTONLESS);
      await withTimeout(
        buttonless.writeValueWithResponse(new Uint8Array([0x01])),
        10_000,
        "enter buttonless DFU",
      );
      log("buttonless DFU request acknowledged");
    } catch (error) {
      // The link can disappear before the write acknowledgement as the display
      // reboots. A later DFU scan is the authoritative success check.
      log(
        `buttonless DFU acknowledgement was lost: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    await sleep(options.rebootSettleMs ?? 1_000);
  }
  return crc;
}

export interface FirmwareTransferOptions {
  executeFirmware?: boolean;
  chunkSize?: number;
  objectSize?: number;
  prn?: number;
  finalizeSettleMs?: number;
  log?: LogFn;
}

export interface DfuTransportOptions {
  chunkSize: number;
  objectSize: number;
  prn: number;
}

export function validateDfuTransportOptions(
  options: Pick<
    FirmwareTransferOptions,
    "chunkSize" | "objectSize" | "prn"
  > = {},
): DfuTransportOptions {
  const chunkSize = options.chunkSize ?? 20;
  const objectSize = options.objectSize ?? 4_096;
  const prn = options.prn ?? 0;

  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error(`chunk size must be a positive integer; received ${chunkSize}`);
  }
  if (!Number.isInteger(objectSize) || objectSize <= 0) {
    throw new Error(`object size must be a positive integer; received ${objectSize}`);
  }
  if (!Number.isInteger(prn) || prn < 0) {
    throw new Error(`PRN must be a non-negative integer; received ${prn}`);
  }
  if (prn >= chunkSize) {
    throw new Error(
      `PRN (${prn} packets) must be less than chunk size (${chunkSize} bytes) ` +
        "so receipt checkpoints remain more frequent than the configured packet payload boundary",
    );
  }

  return { chunkSize, objectSize, prn };
}

export async function transferControllerFirmware(
  server: BluetoothRemoteGATTServer,
  dat: Uint8Array,
  bin: Uint8Array,
  options: FirmwareTransferOptions = {},
): Promise<{ firmwareTransferred: boolean }> {
  const log = options.log ?? (() => {});
  const transport = validateDfuTransportOptions(options);
  const client = await DfuClient.connect(server, {
    chunkSize: transport.chunkSize,
    log,
  });
  await client.setPrn(transport.prn);

  log("transferring signed init packet");
  const commandSelection = await client.select(0x01);
  const commandCrc = crc32Ieee(dat);
  if (commandSelection.offset === 0) {
    await client.transferObject(0x01, dat, {
      expectedOffset: dat.length,
      expectedCrc: commandCrc,
      executeAttempts: 5,
      executeRetryDelayMs: 2_000,
    });
  } else if (
    commandSelection.offset === dat.length &&
    commandSelection.crc === commandCrc
  ) {
    log("init packet already present; retrying execute");
    await client.executeWithRetries(5, 2_000, 30_000);
  } else {
    throw new Error(
      `cannot safely resume init packet: device offset=0x${commandSelection.offset.toString(16)} crc=0x${commandSelection.crc.toString(16)}`,
    );
  }
  log("init packet accepted");

  if (!(options.executeFirmware ?? false)) {
    log("dry run complete; no firmware data was sent");
    return { firmwareTransferred: false };
  }

  const selection = await client.select(0x02);
  const requestedObjectSize = transport.objectSize;
  const objectSize = Math.min(selection.maxSize, requestedObjectSize);
  if (!Number.isInteger(objectSize) || objectSize <= 0) {
    throw new Error(`invalid data object size ${requestedObjectSize}`);
  }
  if (selection.offset > bin.length) {
    throw new Error(
      `device data offset 0x${selection.offset.toString(16)} exceeds firmware length`,
    );
  }
  const resumeCrc = crc32Ieee(bin.subarray(0, selection.offset));
  if (selection.crc !== resumeCrc) {
    throw new Error(
      `cannot safely resume firmware: device CRC=0x${selection.crc.toString(16)} local CRC=0x${resumeCrc.toString(16)}`,
    );
  }

  let offset = selection.offset;
  while (offset < bin.length) {
    const objectBase = Math.floor(offset / objectSize) * objectSize;
    const end = Math.min(objectBase + objectSize, bin.length);
    const data = bin.subarray(offset, end);
    const isLast = end === bin.length;
    log(
      `firmware object: 0x${offset.toString(16)}..0x${end.toString(16)}${isLast ? " (last)" : ""}`,
    );
    await client.transferObject(0x02, data, {
      skipCreate: offset !== objectBase,
      expectedOffset: end,
      expectedCrc: crc32Ieee(bin.subarray(0, end)),
      executeTimeoutMs: isLast ? 120_000 : 15_000,
    });
    offset = end;
  }

  log("firmware transfer complete; waiting for validation and reboot");
  await sleep(options.finalizeSettleMs ?? 1_000);
  log("controller programming will follow in the display application");
  return { firmwareTransferred: true };
}
