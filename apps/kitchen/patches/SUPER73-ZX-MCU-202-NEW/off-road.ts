import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(203);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.3",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    version.patch,
    {
      type: "bytes",
      address: 0x080052eb,
      original: [0xd9],
      data: [0xe0],
      description: "Disable field weakening at all vehicle speeds",
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
