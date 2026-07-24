import { expect, test } from "bun:test";
import { parseDfuPackage } from "./package.js";

const FIRMWARE_DIR = new URL("../../firmware/mc/230-BLUETOOTH-EXT1-310/", import.meta.url);

test("official controller package parses and verifies its reversed SHA-256", async () => {
  const dat = new Uint8Array(
    await Bun.file(new URL("GD_S73Rx_H104_S310US_20221020.dat", FIRMWARE_DIR)).arrayBuffer(),
  );
  const bin = new Uint8Array(
    await Bun.file(new URL("GD_S73Rx_H104_S310US_20221020.bin", FIRMWARE_DIR)).arrayBuffer(),
  );
  const pkg = await parseDfuPackage(dat, bin);
  expect(pkg.appSize).toBe(26_200);
  expect(pkg.hwVersion).toBe(52);
  expect(pkg.hashType).toBe(3);
  expect(pkg.hashMatches).toBe(true);
});

test("a modified payload is allowed but reports the expected hash mismatch", async () => {
  const dat = new Uint8Array(
    await Bun.file(new URL("GD_S73Rx_H104_S310US_20221020.dat", FIRMWARE_DIR)).arrayBuffer(),
  );
  const bin = new Uint8Array(
    await Bun.file(new URL("GD_S73Rx_H104_S310US_20221020.bin", FIRMWARE_DIR)).arrayBuffer(),
  );
  bin[0] = bin[0]! ^ 1;
  expect((await parseDfuPackage(dat, bin)).hashMatches).toBe(false);
});
