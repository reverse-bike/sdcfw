import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import crc32 from "crc-32";
import { buildPatchedImage } from "../../patcher.js";
import type { McPatchFile } from "../types.js";
import { outerCrcPatch, sha256TlvPatch, source } from "./lib.js";

test("finalizes integrity after applying a new combination of behavior patches", () => {
  const descriptor: McPatchFile = {
    ...source,
    patches: [
      {
        type: "bytes",
        address: 0x0003efe9,
        original: [0x20],
        data: [0x42],
        description: "Exercise a distinct throttle ceiling",
      },
    ],
    finalizers: [sha256TlvPatch, outerCrcPatch],
  };
  const input = readFileSync(source.firmwarePath);
  const { output } = buildPatchedImage(descriptor, input);

  const digest = createHash("sha256").update(output.subarray(0x9c, 0x2f61c)).digest();
  expect(output.subarray(0x2f624, 0x2f644)).toEqual(digest);

  const expectedCrc = crc32.buf(output.subarray(0, -4)) >>> 0;
  expect(output.readUInt32LE(output.length - 4)).toBe(expectedCrc);
});
