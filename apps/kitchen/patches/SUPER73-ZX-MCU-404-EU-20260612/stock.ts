import type { McPatchFile } from "../types.js";
import { source } from "./lib.js";

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.0",
    controllerVersion: 404,
  },
  patches: [],
};

export default patchFile;
