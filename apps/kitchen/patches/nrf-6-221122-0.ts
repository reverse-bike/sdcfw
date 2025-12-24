import type { PatchFile } from "./types";
import { publicKeyBytes } from "../keys/public-key-patch";

// Original DFU signing public key in the firmware
const originalPublicKey = [
  0x12, 0xb4, 0xad, 0xa6, 0xaf, 0x80, 0xb9, 0x73,
  0x30, 0x80, 0xbd, 0xea, 0xda, 0x6a, 0x2a, 0xe8,
  0xb4, 0x6a, 0x68, 0x08, 0xe0, 0x3a, 0xd3, 0x26,
  0x54, 0xf1, 0xda, 0xfb, 0x04, 0xe4, 0xf6, 0x2d,
  0x86, 0x29, 0xaa, 0x76, 0x65, 0xd7, 0xb5, 0x22,
  0xe8, 0xaa, 0x94, 0xff, 0x21, 0x4e, 0x8d, 0x0b,
  0x2c, 0x42, 0x5c, 0x53, 0xa7, 0x0d, 0x77, 0xbb,
  0xfb, 0xa8, 0x88, 0xec, 0xbf, 0x92, 0x03, 0x27,
];

/**
 * Patches for nRF firmware version 6-221122-0
 */
const patchFile: PatchFile = {
  name: "nrf-6-221122-0",
  firmwarePath: "firmware/nrf/6-221122-0/flash.bin",
  outputPostfix: ".patched",
  cleanRegions: [
    {
      start: 0x00000,
      end: 0x23000,
      description: "SoftDevice",
    },
    {
      start: 0x23000,
      end: "appEnd",
      description: "Application",
    },
    {
      start: 0x73000,
      end: 0x80000,
      description: "Bootloader",
    },
  ],
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
    {
      type: "find-replace",
      find: originalPublicKey,
      replace: publicKeyBytes,
      description: "Replace DFU signing public key",
    },
  ],
};

export default patchFile;
