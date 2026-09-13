import { expect, test } from "bun:test";
import { parseDfuPackage, validateBootloaderPackage, type DfuPackage } from "./package.js";

// Signed init metadata from the official NRFBL-6 package; no firmware payload.
const dat = new Uint8Array(
  Buffer.from(
    "1284010a3e0801123a080510341a02a5012002280030e08f023800422408031220da92d93c52dd4fedf87dbfaefb460005a5d28604e4ad4c5a73eb4c062d3f27a3480010001a403bdef2175d951a8e2eef76420e80bb740c00ef3c0a743d60860d880f4f36a9117a6bfcd5ccba27aed4ad52dfcd04da228748ad5fed74fdcc80700500fddb7963",
    "hex",
  ),
);

async function fixture(): Promise<DfuPackage> {
  return { ...(await parseDfuPackage(dat, new Uint8Array(34784))), hashMatches: true };
}

test("parses bootloader size separately from application size", async () => {
  const pkg = await fixture();
  expect(pkg.type).toBe(2);
  expect(pkg.blSize).toBe(34784);
  expect(pkg.sdSize).toBe(0);
  expect(pkg.appSize).toBe(0);
  expect(pkg.fwVersion).toBe(5);
  expect(() => validateBootloaderPackage(pkg)).not.toThrow();
});

test("bootloader validation rejects wrong targets, sizes, hashes and requirements", async () => {
  const pkg = await fixture();
  for (const change of [
    { type: 0 },
    { appSize: 1 },
    { sdSize: 1 },
    { blSize: 0 },
    { blSize: 34783 },
    { bin: new Uint8Array(0xc000), blSize: 0xc000 },
    { hashMatches: false },
    { hashType: 0 },
    { hwVersion: 1 },
    { sdReq: [0xff] },
    { signatureType: 1 },
    { signature: new Uint8Array(0) },
  ]) {
    expect(() => validateBootloaderPackage({ ...pkg, ...change })).toThrow();
  }
});
