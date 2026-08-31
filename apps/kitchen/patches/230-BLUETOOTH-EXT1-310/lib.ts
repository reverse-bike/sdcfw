import type { McPatchFile, Patch } from "../types.js";

export const source = {
  name: "mc-230-BLUETOOTH-EXT1-310",
  target: "controller",
  firmwarePath: "firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin",
  datPath: "firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.dat",
  imageBase: 0x08003800,
  expectedSize: 26_200,
  expectedSha256: "90d8bb178b308900375416f319e59f043b3363c158f2bec4dc6bbdb879f97840",
} satisfies Omit<McPatchFile, "patches" | "release" | "finalizers">;

/** Build the instruction that reports a 3XX controller version on CAN 0x266. */
export function reportedVersion(controllerVersion: number): {
  controllerVersion: number;
  patch: Patch;
} {
  const suffix = controllerVersion - 300;
  if (!Number.isInteger(controllerVersion) || suffix < 0 || suffix > 99) {
    throw new Error(`controller version ${controllerVersion} is not a 3XX version`);
  }
  return {
    controllerVersion,
    patch: {
      type: "bytes",
      address: 0x08007e02,
      original: [0x0a, 0x23],
      data: [suffix, 0x23],
      description: `Report controller version ${controllerVersion} on CAN 0x266`,
    },
  };
}
