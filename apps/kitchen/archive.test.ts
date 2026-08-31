import { expect, test } from "bun:test";
import { archiveFileName } from "./archive.js";

test("names a custom archive from its descriptor identity and release facts", () => {
  expect(
    archiveFileName({
      sourceName: "406-BLUETOOTH-EXT1-51511",
      variant: "unlocked",
      stock: false,
      reportedVersion: 51_516,
      version: "1.0.6",
    }),
  ).toBe("406-BLUETOOTH-EXT1-51511-unlocked-r51516-v1.0.6.zip");
});

test("omits the redundant reported version from a stock archive name", () => {
  expect(
    archiveFileName({
      sourceName: "406-BLUETOOTH-EXT1-51511",
      variant: "stock",
      stock: true,
      version: "1.0.0",
    }),
  ).toBe("406-BLUETOOTH-EXT1-51511-stock-v1.0.0.zip");
});
