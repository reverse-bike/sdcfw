import type { McPatchFile } from "../types.js";
import { outerCrcPatch, reportedVersion, sha256TlvPatch, source } from "./lib.js";

const version = reportedVersion(51_516);

const patchFile: McPatchFile = {
  ...source,
  release: {
    version: "1.0.6",
    controllerVersion: version.controllerVersion,
  },
  patches: [
    ...version.patches,
    {
      type: "bytes",
      address: 0x0003ef88,
      original: [0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20, 0x20],
      data: [0x63, 0x63, 0x63, 0x63, 0x63, 0x63, 0x63, 0x63, 0x63, 0x63],
      description: "Raise all baked PAS level speed ceilings from 32 to 99 km/h",
    },
    {
      type: "bytes",
      address: 0x0003efe9,
      original: [0x20],
      data: [0x63],
      description: "Raise the baked throttle speed ceiling from 32 to 99 km/h",
    },
    {
      type: "bytes",
      address: 0x0003f011,
      original: [0x20],
      data: [0x63],
      description: "Raise the baked global PAS speed ceiling from 32 to 99 km/h",
    },
    {
      type: "bytes",
      address: 0x0003f260,
      original: [0x55, 0x1e],
      data: [0x64, 0x64],
      description: "Set the baked speed-power minimum and maximum to 100%",
    },
    {
      type: "bytes",
      address: 0x0003f271,
      original: [0xc4, 0x09],
      data: [0xb8, 0x0b],
      description: "Raise the baked motor mechanical-speed limit from 2500 to 3000 RPM",
    },
  ],
  finalizers: [sha256TlvPatch, outerCrcPatch],
};

export default patchFile;
