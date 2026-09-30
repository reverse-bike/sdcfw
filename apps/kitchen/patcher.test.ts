import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPackage, readPackage } from "@sdcfw/firmware-utils";
import { buildPatchedImage, readBootloaderSettings } from "./patcher";
import stockDisplay from "./patches/6-221122-0/stock";

test("stock display archives preserve factory firmware and clean data outside its regions", async () => {
  const source = readFileSync(path.resolve(import.meta.dir, "../..", stockDisplay.firmwarePath));
  const uicr = readFileSync(path.resolve(import.meta.dir, "../..", stockDisplay.uicrPath));
  const original = Buffer.from(source);

  const { output } = buildPatchedImage(stockDisplay, source);

  const appEnd = 0x23000 + readBootloaderSettings(source).bank0.imageSize;
  expect(output.subarray(0, appEnd).equals(original.subarray(0, appEnd))).toBe(true);
  expect(output.subarray(0x73000).equals(original.subarray(0x73000))).toBe(true);
  expect(output.subarray(appEnd, 0x73000).every((byte) => byte === 0xff)).toBe(true);
  expect(source.equals(original)).toBe(true);

  const built = await buildPackage({
    target: "nrf",
    kind: "stock",
    version: stockDisplay.release!.version,
    nrfVersion: stockDisplay.release!.nrfVersion,
    source: { name: stockDisplay.firmwarePath, data: source },
    flash: { name: "flash.bin", data: output },
    uicr: { name: "uicr.bin", data: uicr },
  });
  const parsed = await readPackage(built.zip);
  if (parsed.target !== "nrf") throw new Error("expected a display package");
  expect(Buffer.from(parsed.flash).equals(output)).toBe(true);
  expect(Buffer.from(parsed.uicr).equals(uicr)).toBe(true);
  expect(parsed.manifest.source.sha256).toBe(stockDisplay.expectedSha256!);
  expect(parsed.manifest.files.flash.sha256).not.toBe(parsed.manifest.source.sha256);
});
