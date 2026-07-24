import type { McPatchFile } from "./types.js";

/**
 * The pristine 310 controller image, published unchanged.
 *
 * This is what makes "go back to stock" possible: it flashes by exactly the
 * same path as a patched release, so packaging it in our archive format gives
 * the web tools a restore target. It applies no patches, and is versioned
 * independently of the patched release built from the same image.
 */
const patchFile: McPatchFile = {
  name: "mc-230-BLUETOOTH-EXT1-310",
  target: "controller",
  firmwarePath: "firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin",
  datPath: "firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.dat",
  imageBase: 0x08003800,
  expectedSize: 26_200,
  expectedSha256: "90d8bb178b308900375416f319e59f043b3363c158f2bec4dc6bbdb879f97840",
  release: {
    version: "1.0.0",
    controllerVersion: 310,
  },
  patches: [],
};

export default patchFile;
