import type { McPatchFile, Patch } from "../types.js";

export const source = {
  name: "mc-SUPER73-ZX-MCU-404-EU-20260612",
  target: "controller",
  firmwarePath: "firmware/mc/SUPER73-ZX-MCU-404-EU-20260612/GD_S73Zxl_H106_S404_EU_2026_0612.bin",
  datPath: "firmware/mc/SUPER73-ZX-MCU-404-EU-20260612/GD_S73Zxl_H106_S404_EU_2026_0612.dat",
  imageBase: 0x08003800,
  expectedSize: 31_396,
  expectedSha256: "f33cfacd327422cf501eecd54e2b8cbfb7d462c9c1a3e488a9ea0601edd612f3",
} satisfies Omit<McPatchFile, "patches" | "release" | "finalizers">;

/** Build the instructions that report this source's controller version over BLE. */
export function reportedVersion(controllerVersion: number): {
  controllerVersion: number;
  patch: Patch;
} {
  if (controllerVersion !== 405) {
    throw new Error(`controller version ${controllerVersion} has no verified instruction encoding`);
  }

  return {
    controllerVersion,
    patch: {
      type: "bytes",
      address: 0x08004cd6,
      original: [0x8b, 0x71, 0xca, 0x71],
      data: [0x05, 0x23, 0xcb, 0x80],
      description: `Report controller version ${controllerVersion} over BLE through CAN 0x266`,
    },
  };
}
