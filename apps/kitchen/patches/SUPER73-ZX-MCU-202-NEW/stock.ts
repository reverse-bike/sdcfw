import type { McPatchFile } from "../types.js";
import { source } from "./lib.js";

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    controllerVersion: 202,
  },
  patches: [],
};

export default patchFile;
