import { expect, test } from "bun:test";
import { DFU_CONTROL_POINT } from "./constants.js";
import { crc32Ieee } from "./crc.js";
import { DfuClient } from "./dfu.js";

function device(maxPacket: number) {
  let notify: (event: Event) => void = () => {};
  let interval = 0;
  let writes = 0;
  const received: number[] = [];
  const attempted: number[] = [];
  const commands: number[] = [];
  const response = (op: number, checksum = false) => {
    const bytes = new Uint8Array(checksum ? 11 : 3);
    bytes.set([0x60, op, 1]);
    if (checksum) {
      const view = new DataView(bytes.buffer);
      view.setUint32(3, received.length, true);
      view.setUint32(7, crc32Ieee(new Uint8Array(received)), true);
    }
    notify({ target: { value: new DataView(bytes.buffer) } } as unknown as Event);
  };
  const control = {
    addEventListener: (_: string, callback: (event: Event) => void) => {
      notify = callback;
    },
    startNotifications: async () => {},
    writeValueWithResponse: async (bytes: Uint8Array) => {
      const op = bytes[0]!;
      commands.push(op);
      if (op === 2) interval = bytes[1]! | (bytes[2]! << 8);
      response(op, op === 3);
    },
  };
  const packet = {
    writeValueWithoutResponse: async (bytes: Uint8Array) => {
      attempted.push(bytes.length);
      if (bytes.length > maxPacket) throw new Error("Packet too large");
      received.push(...bytes);
      writes++;
      if (interval && writes % interval === 0) response(3, true);
    },
  };
  const server = {
    getPrimaryService: async () => ({
      getCharacteristic: async (uuid: string) => (uuid === DFU_CONTROL_POINT ? control : packet),
    }),
  } as unknown as BluetoothRemoteGATTServer;
  return { server, received, attempted, commands };
}

test("244-byte packets deliver a complete object with checksum verification", async () => {
  const target = device(244);
  const client = await DfuClient.connect(target.server, { chunkSize: 244 });
  await client.setPrn(10);
  const data = Uint8Array.from({ length: 4096 }, (_, i) => i & 0xff);
  await client.transferObject(2, data);
  expect(target.attempted).toHaveLength(17);
  expect(target.received).toEqual([...data]);
  expect(target.commands.slice(-2)).toEqual([3, 4]);
});

test("oversized packets fall back without losing bytes or receipt notifications", async () => {
  const target = device(20);
  const client = await DfuClient.connect(target.server, { chunkSize: 244 });
  // A rejected write at a receipt boundary must not consume the retry's PRN.
  await client.setPrn(1);
  const data = Uint8Array.from({ length: 300 }, (_, i) => i & 0xff);
  await client.transferObject(2, data);
  expect(target.attempted.slice(0, 4)).toEqual([244, 100, 58, 20]);
  expect(target.received).toEqual([...data]);
  expect(target.commands.slice(-2)).toEqual([3, 4]);
});
