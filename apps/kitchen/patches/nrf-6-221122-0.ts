import type { PatchFile } from "./types";

/**
 * Patches for nRF firmware version 6-221122-0
 */
const patchFile: PatchFile = {
  name: "nrf-6-221122-0",
  firmwarePath: "firmware/nrf/6-221122-0/flash.bin",
  outputPostfix: ".patched",
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
      original: 0x2301,
      data: 0x2303,
      description: "Load '3' as the initial mode, not '1'",
    },
  ],
};

export default patchFile;
