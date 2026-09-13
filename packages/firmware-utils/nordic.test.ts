import { expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { readNordicBootloaderPackage } from "./nordic.js";

function archive(manifest: unknown, files: Record<string, Uint8Array> = {}) {
  return zipSync({ "manifest.json": strToU8(JSON.stringify({ manifest })), ...files });
}
const bootloader = { bin_file: "bl.bin", dat_file: "bl.dat" };
const files = { "bl.bin": new Uint8Array([1]), "bl.dat": new Uint8Array([2]) };

test("loads a single bootloader entry from a Nordic ZIP", () => {
  expect(readNordicBootloaderPackage(archive({ bootloader }, files))).toEqual({
    bin: files["bl.bin"],
    dat: files["bl.dat"],
  });
});
test("rejects missing files and non-bootloader or mixed archives", () => {
  for (const manifest of [
    { application: bootloader },
    { bootloader, application: bootloader },
    {},
    { bootloader: { bin_file: 1 } },
  ]) {
    expect(() => readNordicBootloaderPackage(archive(manifest, files))).toThrow();
  }
  expect(() => readNordicBootloaderPackage(archive({ bootloader }))).toThrow();
});
