import { expect, spyOn, test } from "bun:test";
import {
  transferDfuFirmware,
  transferControllerFirmware,
  validateDfuTransportOptions,
} from "./update.js";
import { DfuClient } from "./dfu.js";

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
