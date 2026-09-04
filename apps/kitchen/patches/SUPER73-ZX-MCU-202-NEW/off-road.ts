import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(203);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.5",
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
      address: 0x08007766,
      original: [0x2d, 0x2e],
      data: [0x18, 0x2e],
      description: "Stop reducing mode 3/7 throttle current above 24 km/h",
    },
    {
      type: "bytes",
      address: 0x080077a4,
      original: [0xd0, 0xf8, 0x24, 0x02],
      data: [0xd0, 0xf8, 0xd0, 0x01],
      description: "Hold the mode 3/7 throttle current factor at 108 above 24 km/h",
    },
  ],
};

export default patchFile;
