import { expect, test } from "bun:test";
import { crc32Ieee, crc32Mpeg2Update, deviceImageCrc } from "./crc.js";
import { stagedImage } from "./package.js";
import { controllerImageCrc, createArmPacket } from "./update.js";

test("CRC-32/MPEG-2 standard vector", () => {
  expect(crc32Mpeg2Update(new TextEncoder().encode("123456789"))).toBe(0x0376e6e7);
});

test("CRC-32/IEEE standard vector", () => {
  expect(crc32Ieee(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
});

test("official S310US controller image has the researched staged CRC", async () => {
  const path = new URL(
    "../../firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin",
    import.meta.url,
  );
  const bin = new Uint8Array(await Bun.file(path).arrayBuffer());
  expect(bin.length).toBe(26_200);
  expect(deviceImageCrc(stagedImage(bin))).toBe(0xb0273ea1);
  expect(Array.from(createArmPacket(controllerImageCrc(bin)))).toEqual([
    0xf0, 0xcc, 0x80, 0xb0, 0x27, 0x3e, 0xa1, 0x01, 0x00, 0x00,
  ]);
});
