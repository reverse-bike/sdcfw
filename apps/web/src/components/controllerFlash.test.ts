/// <reference types="bun" />

import { expect, test } from "bun:test";
import { controllerDfuChunkSize } from "./controllerFlash";

test("uses larger controller packets only for the verified bootloader version", () => {
  expect(controllerDfuChunkSize(8)).toBe(244);
  for (const version of [undefined, 0, 6, 7, 9]) {
    expect(controllerDfuChunkSize(version)).toBe(20);
  }
});
