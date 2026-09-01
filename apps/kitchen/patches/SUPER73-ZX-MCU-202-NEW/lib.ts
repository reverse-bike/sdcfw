import type { McPatchFile, Patch } from "../types.js";

export const source = {
  name: "mc-SUPER73-ZX-MCU-202",
  target: "controller",
  firmwarePath: "firmware/mc/SUPER73-ZX-MCU-202-NEW/GD_S73Zxl_H101_S202_2024_1123_FxedUS.bin",
  datPath: "firmware/mc/SUPER73-ZX-MCU-202-NEW/GD_S73Zxl_H101_S202_2024_1123_FxedUS.dat",
  imageBase: 0x08003800,
  expectedSize: 29_396,
  expectedSha256: "8687af4de77c81682beeaa39af65f1b2536301d917124c43193d72ad63af0f9a",
} satisfies Omit<McPatchFile, "patches" | "release" | "finalizers">;

/** Build the instructions that report this source's controller version over BLE. */
export function reportedVersion(controllerVersion: number): {
  controllerVersion: number;
  patch: Patch;
} {
  const suffix = controllerVersion - 200;
  if (!Number.isInteger(controllerVersion) || suffix < 0 || suffix > 99) {
    throw new Error(`controller version ${controllerVersion} is not a supported 2XX version`);
  }
  return {
    controllerVersion,
    patch: {
      type: "bytes",
      address: 0x08008550,
      original: [0xa1, 0x71, 0xe6, 0x71],
      data: [suffix, 0x21, 0xe1, 0x80],
      description: `Report controller version ${controllerVersion} over BLE through CAN 0x266`,
    },
  };
}
