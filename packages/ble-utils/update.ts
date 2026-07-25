import { APP_RX_CHAR, APP_SERVICE, DFU_BUTTONLESS, DFU_SERVICE } from "./constants.js";
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

const BUTTONLESS_ENTER_DFU = 0x01;
const BUTTONLESS_RESPONSE = 0x20;
const BUTTONLESS_SUCCESS = 0x01;

const BUTTONLESS_RESULTS: Record<number, string> = {
  0x01: "success",
  0x02: "op code not supported",
  0x03: "operation failed",
  0x04: "invalid advertisement name",
  0x05: "busy",
  0x06: "not bonded",
};

/**
 * True when a failed operation is explained by the display already having
 * rebooted, rather than by the display rejecting the request.
 */
function isLinkLoss(error: unknown, server: BluetoothRemoteGATTServer): boolean {
  if (!server.connected) return true;
  const name = (error as { name?: string } | null)?.name;
  if (name === "NetworkError") return true;
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("disconnect") || message.includes("not connected");
}

/** Resolves with the buttonless control point indication, or undefined if none arrives. */
function awaitButtonlessResponse(
  characteristic: BluetoothRemoteGATTCharacteristic,
  timeoutMs: number,
): { response: Promise<Uint8Array | undefined>; cancel: () => void } {
  let settle: (value: Uint8Array | undefined) => void = () => {};
  const onChange = (event: Event): void => {
    const value = (event.target as BluetoothRemoteGATTCharacteristic).value;
    if (!value) return;
    settle(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  };
  characteristic.addEventListener("characteristicvaluechanged", onChange);

  let timer: ReturnType<typeof setTimeout>;
  const response = new Promise<Uint8Array | undefined>((resolve) => {
    settle = (value) => {
      clearTimeout(timer);
      characteristic.removeEventListener("characteristicvaluechanged", onChange);
      resolve(value);
    };
    timer = setTimeout(() => settle(undefined), timeoutMs);
  });
  return { response, cancel: () => settle(undefined) };
}

export async function enterDfuMode(
  server: BluetoothRemoteGATTServer,
  options: {
    rebootSettleMs?: number;
    responseTimeoutMs?: number;
    log?: LogFn;
  } = {},
): Promise<void> {
  const log = options.log ?? (() => {});
  log("requesting buttonless DFU reboot");
  const dfuService = await withTimeout(
    server.getPrimaryService(DFU_SERVICE),
    10_000,
    "get buttonless DFU service",
  );
  const buttonless = await dfuService.getCharacteristic(DFU_BUTTONLESS);

  // Nordic's buttonless service refuses control point writes with "CCCD
  // improperly configured" until indications are enabled on the same link.
  try {
    await withTimeout(buttonless.startNotifications(), 10_000, "enable buttonless DFU indications");
  } catch (error) {
    log(
      `could not enable buttonless DFU indications: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const pending = awaitButtonlessResponse(buttonless, options.responseTimeoutMs ?? 3_000);
  let rebooted = false;
  try {
    await withTimeout(
      buttonless.writeValueWithResponse(new Uint8Array([BUTTONLESS_ENTER_DFU])),
      10_000,
      "enter buttonless DFU",
    );
    log("buttonless DFU request acknowledged");
  } catch (error) {
    // The link can disappear before the write acknowledgement as the display
    // reboots; anything else is a rejection that leaves the bike running.
    if (!isLinkLoss(error, server)) {
      pending.cancel();
      throw new Error(
        `the display rejected the buttonless DFU request: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    rebooted = true;
    log(
      `buttonless DFU acknowledgement was lost, which usually means the display rebooted: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!rebooted) {
    const response = await pending.response;
    if (!response) {
      log("no buttonless DFU response indication arrived; relying on the DFU scan instead");
    } else if (response[0] === BUTTONLESS_RESPONSE && response[2] !== BUTTONLESS_SUCCESS) {
      const result = response[2] ?? 0;
      throw new Error(
        `buttonless DFU request failed: ${BUTTONLESS_RESULTS[result] ?? `result 0x${result.toString(16)}`} (raw ${hex(response)})`,
      );
    } else {
      log(`buttonless DFU response: ${hex(response)}`);
    }
  }
  pending.cancel();
  await sleep(options.rebootSettleMs ?? 1_000);
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
  await withTimeout(rx.writeValueWithResponse(packet), 15_000, "write F0CC arm packet");

  if (options.enterDfu ?? true) {
    const eraseWaitMs = options.eraseWaitMs ?? 8_000;
    log(`external staging area armed; waiting ${eraseWaitMs / 1000}s`);
    await sleep(eraseWaitMs);
    const rebootOptions =
      options.rebootSettleMs === undefined
        ? { log }
        : { rebootSettleMs: options.rebootSettleMs, log };
    await enterDfuMode(server, rebootOptions);
  }
  return crc;
}

export interface TransferProgress {
  /** Which object is moving: the signed init packet, or the firmware itself */
  phase: "init" | "firmware";
  bytesSent: number;
  totalBytes: number;
}

export interface FirmwareTransferOptions {
  executeFirmware?: boolean;
  chunkSize?: number;
  objectSize?: number;
  prn?: number;
  finalizeSettleMs?: number;
  log?: LogFn;
  /** Reports transfer position, for driving a progress bar */
  onProgress?: (progress: TransferProgress) => void;
}

export interface DfuTransportOptions {
  chunkSize: number;
  objectSize: number;
  prn: number;
}

export function validateDfuTransportOptions(
  options: Pick<FirmwareTransferOptions, "chunkSize" | "objectSize" | "prn"> = {},
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
  const report = (phase: TransferProgress["phase"], bytesSent: number, totalBytes: number): void =>
    options.onProgress?.({ phase, bytesSent, totalBytes });

  const client = await DfuClient.connect(server, {
    chunkSize: transport.chunkSize,
    log,
  });
  await client.setPrn(transport.prn);

  log("transferring signed init packet");
  report("init", 0, dat.length);
  const commandSelection = await client.select(0x01);
  const commandCrc = crc32Ieee(dat);
  if (commandSelection.offset === 0) {
    await client.transferObject(0x01, dat, {
      expectedOffset: dat.length,
      expectedCrc: commandCrc,
      executeAttempts: 5,
      executeRetryDelayMs: 2_000,
      onBytes: (sent) => report("init", sent, dat.length),
    });
  } else if (commandSelection.offset === dat.length && commandSelection.crc === commandCrc) {
    log("init packet already present; retrying execute");
    await client.executeWithRetries(5, 2_000, 30_000);
  } else {
    throw new Error(
      `cannot safely resume init packet: device offset=0x${commandSelection.offset.toString(16)} crc=0x${commandSelection.crc.toString(16)}`,
    );
  }
  log("init packet accepted");
  report("init", dat.length, dat.length);

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
  report("firmware", offset, bin.length);
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
      onBytes: (sent) => report("firmware", sent, bin.length),
    });
    offset = end;
  }

  log("firmware transfer complete; waiting for validation and reboot");
  await sleep(options.finalizeSettleMs ?? 1_000);
  log("controller programming will follow in the display application");
  return { firmwareTransferred: true };
}
