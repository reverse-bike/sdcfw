import type { McPatchFile } from "./types.js";

const patchFile: McPatchFile = {
  name: "mc-SUPER73-ZX-MCU-202",
  target: "controller",
  firmwarePath: "firmware/mc/SUPER73-ZX-MCU-202-NEW/GD_S73Zxl_H101_S202_2024_1123_FxedUS.bin",
  datPath: "firmware/mc/SUPER73-ZX-MCU-202-NEW/GD_S73Zxl_H101_S202_2024_1123_FxedUS.dat",
  imageBase: 0x08003800,
  expectedSize: 29_396,
  expectedSha256: "8687af4de77c81682beeaa39af65f1b2536301d917124c43193d72ad63af0f9a",
  release: {
    version: "1.0.0",
    controllerVersion: 202,
  },
  patches: [],
};

export default patchFile;
