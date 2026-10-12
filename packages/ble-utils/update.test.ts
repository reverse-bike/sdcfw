import { expect, spyOn, test } from "bun:test";
import {
  transferDfuFirmware,
  transferControllerFirmware,
  validateDfuTransportOptions,
} from "./update.js";
import { DfuClient } from "./dfu.js";
import { DFU_CONTROL_POINT } from "./constants.js";
import { crc32Ieee } from "./crc.js";

test("accepts the default DFU transport settings", () => {
  expect(validateDfuTransportOptions()).toEqual({
    chunkSize: 20,
    objectSize: 4_096,
    prn: 10,
  });
});

test("shared DFU dry run executes only the init object and never selects firmware data", async () => {
  const selected: number[] = [];
  const transferred: number[] = [];
  const client = {
    setPrn: async () => {},
    close: () => {},
    select: async (type: number) => {
      selected.push(type);
      return { maxSize: 4096, offset: 0, crc: 0 };
    },
    transferObject: async (type: number) => {
      transferred.push(type);
    },
  };
  const spy = spyOn(DfuClient, "connect").mockResolvedValue(client as unknown as DfuClient);
  try {
    const result = await transferDfuFirmware(
      {} as BluetoothRemoteGATTServer,
      new Uint8Array([1]),
      new Uint8Array([2]),
    );
    expect(result.firmwareTransferred).toBe(false);
    expect(selected).toEqual([1]);
    expect(transferred).toEqual([1]);
  } finally {
    spy.mockRestore();
  }
});

test("shared transport sends firmware only on opt-in; controller wrapper retains its completion message", async () => {
  const transferred: number[] = [];
  const client = {
    setPrn: async () => {},
    close: () => {},
    select: async () => ({ maxSize: 4096, offset: 0, crc: 0 }),
    transferObject: async (type: number) => {
      transferred.push(type);
    },
  };
  const spy = spyOn(DfuClient, "connect").mockResolvedValue(client as unknown as DfuClient);
  try {
    for (const transfer of [transferDfuFirmware, transferControllerFirmware]) {
      const log: string[] = [];
      transferred.length = 0;
      const result = await transfer(
        {} as BluetoothRemoteGATTServer,
        new Uint8Array([1]),
        new Uint8Array([2]),
        {
          executeFirmware: true,
          finalizeSettleMs: 0,
          log: (line) => log.push(line),
        },
      );
      expect(result.firmwareTransferred).toBe(true);
      expect(spy.mock.calls.at(-1)?.[1]?.chunkSize).toBe(20);
      expect(transferred).toEqual([1, 2]);
      expect(log.some((line) => line.includes("controller programming"))).toBe(
        transfer === transferControllerFirmware,
      );
    }
  } finally {
    spy.mockRestore();
  }
});

test("requires PRN to fit the DFU command field", () => {
  expect(() =>
    validateDfuTransportOptions({
      prn: 0x1_0000,
    }),
  ).toThrow("PRN must fit in 16 bits");
});

test("rejects fractional and non-positive transport settings", () => {
  expect(() => validateDfuTransportOptions({ chunkSize: 0 })).toThrow(
    "chunk size must be a positive integer",
  );
  expect(() => validateDfuTransportOptions({ objectSize: 1.5 })).toThrow(
    "object size must be a positive integer",
  );
  expect(() => validateDfuTransportOptions({ prn: -1 })).toThrow(
    "PRN must be a non-negative integer",
  );
});

/**
 * A Nordic Secure DFU bootloader that keeps partial objects across
 * connections, like the display's, and drops the link at chosen packet writes.
 * A dropped write resolves without delivering its bytes, the way a write
 * without response can vanish when the radio link fails.
 *
 * `previous` seeds the progress a bootloader remembers from an earlier
 * session. Creating the init object resets it, as Nordic's does, unless
 * `keepsProgress` is set.
 */
function flakyBootloader(
  dropAtWrites: number[],
  previous: { init?: Uint8Array; firmware?: Uint8Array; keepsProgress?: boolean } = {},
) {
  const disconnectListeners = new Set<(event: Event) => void>();
  let notify: (event: Event) => void = () => {};
  let connected = true;
  let connects = 0;
  let prn = 0;
  let writes = 0;
  let writesSincePrn = 0;
  let current = 1;
  const init: number[] = [...(previous.init ?? [])];
  const firmware: number[] = [...(previous.firmware ?? [])];
  let committed = firmware.length;
  let initCreates = 0;
  const objectOf = (type: number) => (type === 1 ? init : firmware);
  const u32 = (value: number) => [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
  const respond = (bytes: number[]) =>
    notify({
      target: { value: new DataView(new Uint8Array(bytes).buffer) },
    } as unknown as Event);
  const checksum = (data: number[]) => [
    ...u32(data.length),
    ...u32(crc32Ieee(new Uint8Array(data))),
  ];
  const lost = () =>
    Object.assign(new Error("GATT Server is disconnected."), { name: "NetworkError" });
  const drop = () => {
    connected = false;
    for (const listener of disconnectListeners) listener(new Event("gattserverdisconnected"));
  };

  const control = {
    addEventListener: (_: string, callback: (event: Event) => void) => {
      notify = callback;
    },
    removeEventListener: () => {},
    startNotifications: async () => {
      if (!connected) throw lost();
    },
    writeValueWithResponse: async (bytes: Uint8Array) => {
      if (!connected) throw lost();
      const op = bytes[0]!;
      if (op === 0x02) {
        prn = bytes[1]! | (bytes[2]! << 8);
        writesSincePrn = 0;
        respond([0x60, op, 1]);
      } else if (op === 0x06) {
        current = bytes[1]!;
        respond([
          0x60,
          op,
          1,
          ...u32(current === 1 ? 0x100 : 0x1000),
          ...checksum(objectOf(current)),
        ]);
      } else if (op === 0x01) {
        current = bytes[1]!;
        if (current === 1) {
          initCreates++;
          init.length = 0;
          if (!previous.keepsProgress) firmware.length = committed = 0;
        } else firmware.length = committed;
        respond([0x60, op, 1]);
      } else if (op === 0x03) {
        respond([0x60, op, 1, ...checksum(objectOf(current))]);
      } else if (op === 0x04) {
        if (current === 2) committed = firmware.length;
        respond([0x60, op, 1]);
      }
    },
  };
  const packet = {
    writeValueWithoutResponse: async (bytes: Uint8Array) => {
      if (!connected) throw lost();
      writes++;
      if (dropAtWrites[0] === writes) {
        dropAtWrites.shift();
        drop();
        return;
      }
      objectOf(current).push(...bytes);
      if (prn && ++writesSincePrn % prn === 0)
        respond([0x60, 0x03, 1, ...checksum(objectOf(current))]);
    },
  };
  const device = {
    addEventListener: (_: string, listener: (event: Event) => void) => {
      disconnectListeners.add(listener);
    },
    removeEventListener: (_: string, listener: (event: Event) => void) => {
      disconnectListeners.delete(listener);
    },
    gatt: undefined as unknown,
  };
  const server = {
    device,
    get connected() {
      return connected;
    },
    connect: async () => {
      connects++;
      connected = true;
      return server;
    },
    disconnect: () => {
      if (connected) drop();
    },
    getPrimaryService: async () => {
      if (!connected) throw lost();
      return {
        getCharacteristic: async (uuid: string) => (uuid === DFU_CONTROL_POINT ? control : packet),
      };
    },
  };
  device.gatt = server;
  return {
    server: server as unknown as BluetoothRemoteGATTServer,
    firmware,
    get initCreates() {
      return initCreates;
    },
    get committed() {
      return committed;
    },
    get connects() {
      return connects;
    },
  };
}

test("a dropped link reconnects and resumes until the firmware is complete", async () => {
  // Write 10 is a receipt boundary, so its loss is only noticed while waiting
  // for the receipt; writes 25 and 61 are noticed by the following write.
  const target = flakyBootloader([10, 25, 61]);
  const dat = Uint8Array.from({ length: 0x8e }, (_, i) => i);
  const bin = Uint8Array.from({ length: 8 * 0x1000 + 100 }, (_, i) => (i * 7) & 0xff);
  const log: string[] = [];
  const result = await transferDfuFirmware(target.server, dat, bin, {
    chunkSize: 244,
    executeFirmware: true,
    finalizeSettleMs: 0,
    linkRetryDelayMs: 0,
    log: (line) => log.push(line),
  });
  expect(result.firmwareTransferred).toBe(true);
  expect(target.firmware).toEqual([...bin]);
  expect(target.committed).toBe(bin.length);
  expect(target.connects).toBe(3);
  expect(log.filter((line) => line.startsWith("link lost"))).toHaveLength(3);
  expect(log.some((line) => line.includes("reducing chunk size"))).toBe(false);
});

test("stops reconnecting once the device stops gaining data", async () => {
  // After the first drop, every connection loses its first packet.
  const target = flakyBootloader([10, 11, 12, 13, 14, 15, 16]);
  const transfer = transferDfuFirmware(
    target.server,
    new Uint8Array(0x8e),
    new Uint8Array(0x2000),
    { executeFirmware: true, finalizeSettleMs: 0, linkRetries: 3, linkRetryDelayMs: 0 },
  );
  await expect(transfer).rejects.toThrow("link");
  // One connection that made progress, then three that did not.
  expect(target.connects).toBe(4);
});

test("a restart discards progress the bootloader remembers from before the arm", async () => {
  const dat = Uint8Array.from({ length: 0x8e }, (_, i) => i);
  const bin = Uint8Array.from({ length: 3 * 0x1000 + 100 }, (_, i) => (i * 7) & 0xff);
  // The arm prepares staging afresh, so this remembered prefix is gone from it.
  const target = flakyBootloader([], { init: dat, firmware: bin.subarray(0, 0x1800) });
  const progress: number[] = [];
  await transferDfuFirmware(target.server, dat, bin, {
    executeFirmware: true,
    finalizeSettleMs: 0,
    restart: true,
    onProgress: (report) => {
      if (report.phase === "firmware") progress.push(report.bytesSent);
    },
  });
  expect(target.initCreates).toBe(1);
  expect(progress[0]).toBe(0);
  expect(target.firmware).toEqual([...bin]);
});

test("a restart refuses a bootloader that keeps its progress", async () => {
  const dat = new Uint8Array(0x8e);
  const bin = new Uint8Array(0x2000);
  const target = flakyBootloader([], {
    init: dat,
    firmware: bin.subarray(0, 0x1000),
    keepsProgress: true,
  });
  const transfer = transferDfuFirmware(target.server, dat, bin, {
    executeFirmware: true,
    finalizeSettleMs: 0,
    restart: true,
  });
  await expect(transfer).rejects.toThrow("did not reset");
});

test("reconnects after a restart resume rather than restarting again", async () => {
  const dat = new Uint8Array(0x8e);
  const bin = Uint8Array.from({ length: 2 * 0x1000 }, (_, i) => i & 0xff);
  const target = flakyBootloader([300], { init: dat, firmware: bin.subarray(0, 0x1000) });
  await transferDfuFirmware(target.server, dat, bin, {
    executeFirmware: true,
    finalizeSettleMs: 0,
    linkRetryDelayMs: 0,
    restart: true,
  });
  expect(target.connects).toBe(1);
  expect(target.initCreates).toBe(1);
  expect(target.firmware).toEqual([...bin]);
});
