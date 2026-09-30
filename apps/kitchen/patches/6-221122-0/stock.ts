import type { NrfPatchFile } from "../types.js";
import { source } from "./lib.js";

const patchFile: NrfPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    nrfVersion: "221122",
  },
  patches: [],
};

export default patchFile;
