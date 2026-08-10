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
    controllerVersion: 203,
  },
  patches: [
    {
      type: "bytes",
      address: 0x0800607a,
      original: [0x01, 0x26],
      data: [0x03, 0x26],
      description: "Initialize internal operating mode to 3",
    },
    {
      type: "bytes",
      address: 0x08009ede,
      original: [0x4f, 0xf0, 0xca, 0x00],
      data: [0x4f, 0xf0, 0xcb, 0x00],
      description: "Report controller version 203 through SDO 0x1F87",
    },
    {
      type: "bytes",
      address: 0x08009d6a,
      original: [0x02, 0x70],
      data: [0x00, 0xbf],
      description: "Ignore operating-mode changes received over CAN 0x300",
    },
    {
      type: "bytes",
      address: 0x08006f6a,
      original: [0x6e, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 low-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08006f6c,
      original: [0x46, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 high-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x080052a0,
      original: [0x4f, 0xf0, 0x26, 0x0c],
      data: [0x4f, 0xf0, 0x4c, 0x0c],
      description: "Double q-axis current-command filter coefficient",
    },
  ],
};

export default patchFile;
