import type { McPatchFile } from "../types.js";
import { reportedVersion, source } from "./lib.js";

const version = reportedVersion(405);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    version.patch,
    {
      type: "bytes",
      address: 0x08006c72,
      original: [0xc0, 0xf3, 0xcf, 0x0a],
      data: [0x4f, 0xf0, 0x00, 0x0a],
      description: "Hold the mode 4 current-envelope index at its maximum-current entry",
    },
    {
      type: "bytes",
      address: 0x08006d26,
      original: [0x00, 0xf3, 0x5f, 0x84],
      data: [0xaf, 0xf3, 0x00, 0x80],
      description: "Remove the mode 4 throttle-command ceiling",
    },
    {
      type: "bytes",
      address: 0x0800556e,
      original: [0x7c, 0xd9],
      data: [0x7c, 0xe0],
      description: "Keep the d-axis current target on its zero-current decay path",
    },
  ],
};

export default patchFile;
