import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(203);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.8",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    version.patch,
    {
      type: "bytes",
      address: 0x08007682,
      original: [
        0x00, 0xeb, 0xc0, 0x02, 0xc2, 0xeb, 0x00, 0x40, 0x49, 0x42, 0x09, 0xb2, 0x00, 0xb2,
      ],
      // r0 holds the negated slewed command. Multiply by -12 and saturate
      // to the signed 16-bit PI target range; preserve signed feedback in r1.
      // movs r2,#12; muls r0,r2,r0; rsbs r0,r0,#0; ssat r0,#16,r0;
      // rsbs r1,r1,#0; sxth r1,r1
      data: [
        0x0c, 0x22, 0x50, 0x43, 0x40, 0x42, 0x00, 0xf3, 0x0f, 0x00, 0x49, 0x42, 0x09, 0xb2,
      ],
      description: "Raise the shared throttle speed-target multiplier from 9x to 12x without signed wraparound",
    },
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
      data: [0x0d, 0x2e],
      description: "Stop reducing mode 3/7 throttle current at 13 km/h",
    },
    {
      type: "bytes",
      address: 0x080077a4,
      original: [0xd0, 0xf8, 0x24, 0x02],
      // Table entry 13 contains factor 200: 0x170 + 13 * 4 = 0x1a4.
      data: [0xd0, 0xf8, 0xa4, 0x01],
      description: "Hold the mode 3/7 throttle current factor at 200 at and above 13 km/h",
    },
  ],
};

export default patchFile;
