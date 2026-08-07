import type { McPatchFile } from "./types.js";

const patchFile: McPatchFile = {
  name: "mc-231-BLUETOOTH-EXT1-410",
  target: "controller",
  firmwarePath: "firmware/mc/231-BLUETOOTH-EXT1-410/GD_S73Rx_H104_S410EU_20221020.bin",
  datPath: "firmware/mc/231-BLUETOOTH-EXT1-410/GD_S73Rx_H104_S410EU_20221020.dat",
  imageBase: 0x08003800,
  expectedSize: 26_200,
  expectedSha256: "c8d4aba4bbcbb8e5178c841580ce13bc4b97141b5c87b59e5b1cfd99650234ab",
  release: {
    version: "1.0.0",
    controllerVersion: 410,
  },
  patches: [],
};

export default patchFile;
