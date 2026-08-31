import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(203);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    {
      type: "bytes",
      address: 0x0800607a,
      original: [0x01, 0x26],
      data: [0x03, 0x26],
      description: "Initialize internal operating mode to 3",
    },
    version.patch,
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
