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

/** Build the instruction that reports this source's controller version. */
export function reportedVersion(controllerVersion: number): {
  controllerVersion: number;
  patch: Patch;
} {
  if (!Number.isInteger(controllerVersion) || controllerVersion < 0 || controllerVersion > 0xff) {
    throw new Error(`controller version ${controllerVersion} does not fit the encoded instruction`);
  }
  return {
    controllerVersion,
    patch: {
      type: "bytes",
      address: 0x08009ede,
      original: [0x4f, 0xf0, 0xca, 0x00],
      data: [0x4f, 0xf0, controllerVersion, 0x00],
      description: `Report controller version ${controllerVersion} through SDO 0x1F87`,
    },
  };
}
