import { expect, test } from "bun:test";
import { validateDfuTransportOptions } from "./update.js";

test("accepts the default DFU transport settings", () => {
  expect(validateDfuTransportOptions()).toEqual({
    chunkSize: 20,
    objectSize: 4_096,
    prn: 0,
  });
});

test("requires PRN to be less than chunk size", () => {
  expect(() =>
    validateDfuTransportOptions({
      chunkSize: 20,
      prn: 20,
    }),
  ).toThrow("PRN (20 packets) must be less than chunk size (20 bytes)");
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
