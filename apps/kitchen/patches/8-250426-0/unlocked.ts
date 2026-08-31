import type { NrfPatchFile } from "../types.js";
import { signingKeyPatch, source } from "./lib.js";

const patchFile: NrfPatchFile = {
  ...source,
  patches: [
    {
      address: 0x3a7ac,
      type: "string",
      original: "versions",
      data: "versionz",
      description: 'Change "versions" to "versionz"',
    },
    {
      address: 0x32986,
      type: "bytes",
      original: [0x01, 0x22],
      data: [0x03, 0x22],
      description: "Set ride mode to 3 on every power-on transition",
    },
    signingKeyPatch,
  ],
};

export default patchFile;
