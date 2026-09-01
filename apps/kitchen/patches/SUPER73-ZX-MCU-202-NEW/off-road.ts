import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(203);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.1",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    version.patch,
    {
      type: "bytes",
      address: 0x080069ea,
      original: [0x64, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 low-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x080069ec,
      original: [0x46, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 high-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08006f6a,
      original: [0x6e, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 7 low-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08006f6c,
      original: [0x46, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 7 high-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08007768,
      original: [0x1c, 0xd2, 0x00, 0xeb, 0x86, 0x00],
      data: [0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf],
      description: "Bypass speed-dependent current scaling in the mode 3/7 throttle path",
    },
    {
      type: "bytes",
      address: 0x08007822,
      original: [0x1c, 0xd2, 0x01, 0xeb, 0x86, 0x01],
      data: [0x00, 0xbf, 0x00, 0xbf, 0x00, 0xbf],
      description: "Bypass speed-dependent current scaling in the primary command path",
    },
  ],
};

export default patchFile;
