import { expect, test } from "bun:test";
import { buildPackage } from "@sdcfw/firmware-utils";
import { readControllerArchive } from "./firmware.js";

const bin = new Uint8Array([1, 2, 3, 4]);
const dat = new Uint8Array([9, 9]);

test("reads and verifies controller files from a Kitchen archive", async () => {
  const built = await buildPackage({
    target: "controller",
    version: "1.2.3",
    kind: "patched",
    controllerVersion: 311,
    bin: { name: "controller.patched.bin", data: bin },
    dat: { name: "controller.dat", data: dat },
    source: { name: "controller.bin", data: new Uint8Array([0, 0, 0, 0]) },
  });

  const firmware = await readControllerArchive(built.zip, "release.zip");

  expect(firmware.bin).toEqual(bin);
  expect(firmware.dat).toEqual(dat);
  expect(firmware.binLabel).toBe("release.zip:controller.patched.bin");
  expect(firmware.datLabel).toBe("release.zip:controller.dat");
  expect(firmware.description).toBe("controller 311 (release 1.2.3)");
});

test("rejects a display archive", async () => {
  const built = await buildPackage({
    target: "nrf",
    version: "1.0.0",
    kind: "patched",
    nrfVersion: "221122",
    flash: { name: "flash.bin", data: new Uint8Array([1]) },
    uicr: { name: "uicr.bin", data: new Uint8Array([2]) },
    source: { name: "firmware/nrf/flash.bin", data: new Uint8Array([0]) },
  });

  await expect(readControllerArchive(built.zip, "display.zip")).rejects.toThrow(
    "display.zip targets the display; mc-farm only flashes motor-controller archives",
  );
});
