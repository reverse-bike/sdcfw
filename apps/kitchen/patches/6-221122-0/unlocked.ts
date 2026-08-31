import type { NrfPatchFile } from "../types.js";
import { signingKeyPatch, source } from "./lib.js";

const patchFile: NrfPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    nrfVersion: "221122",
  },
  patches: [
    {
      address: 0x3af00,
      type: "string",
      original: "versions",
      data: "versionz",
      description: 'Change "versions" to "versionz"',
    },
    {
      address: 0x3050c,
      type: "uint16",
      original: 0x0123,
      data: 0x0323,
      description: "Load '3' as the initial mode, not '1'",
    },
    signingKeyPatch,
  ],
};

export default patchFile;
