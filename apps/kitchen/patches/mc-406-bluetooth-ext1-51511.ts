import type { McPatchFile } from "./types.js";

const patchFile: McPatchFile = {
  name: "mc-406-BLUETOOTH-EXT1-51511",
  target: "controller",
  firmwarePath: "firmware/mc/406-BLUETOOTH-EXT1-51511/DFU_pack_no_IoT_5.15.11_can_only.bin",
  datPath: "firmware/mc/406-BLUETOOTH-EXT1-51511/DFU_pack_no_IoT_5.15.11_can_only.dat",
  imageBase: 0x0000ff64,
  expectedSize: 194_120,
  expectedSha256: "5cc1aeed2f71e8f3cf7c61b73515cc7644b04901a4df20ab463ca44195dfdb37",
  release: {
    version: "1.0.0",
    controllerVersion: 51_512,
  },
  patches: [
    {
      type: "bytes",
      address: 0x00010020,
      original: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
      data: [0x40, 0xf2, 0x0c, 0x00, 0xc0, 0xf2, 0x0f, 0x50, 0x70, 0x47],
      description: "Add a CAN-only helper returning controller version 51512",
    },
    {
      type: "bytes",
      address: 0x00019078,
      original: [0x03, 0xf0, 0xc8, 0xfa],
      data: [0xf6, 0xf7, 0xd2, 0xff],
      description: "Report version 51512 through CANopen 0x2008 and BLE only",
    },
    {
      type: "bytes",
      address: 0x0002312a,
      original: [0x09, 0xf0, 0xe9, 0xf8],
      data: [0x09, 0xf0, 0xff, 0xf8],
      description: "Use the display-driven 0x201C ceiling for both throttle minimum inputs",
    },
    {
      type: "bytes",
      address: 0x0002313a,
      original: [0x00, 0xf0, 0x41, 0xfd],
      data: [0xfd, 0xf7, 0x6b, 0xff],
      description: "Apply the display-driven throttle ceiling without vehicle-context caps",
    },
    {
      type: "bytes",
      address: 0x0002b042,
      original: [0x94, 0xf8, 0xe8, 0x01],
      data: [0x64, 0x20, 0x00, 0xbf],
      description: "Set the speed-power maximum to 100% before flattening the curve",
    },
    {
      type: "bytes",
      address: 0x0002b068,
      original: [0x38, 0xbf],
      data: [0x00, 0xbf],
      description: "Flatten the speed-power curve at its configured maximum",
    },
    {
      type: "bytes",
      address: 0x0003f588,
      original: Array.from(
        Uint8Array.fromHex("374483dce91f9b02d2d234adca6718fdde36fee9a03f1e87d25f5dd520f51d80"),
      ),
      data: Array.from(
        Uint8Array.fromHex("dfec280c4865c28588bdd695d1ebf0edd5db001c4b8226ca877c049905b816de"),
      ),
      description: "Update the MCUboot SHA-256 TLV for the patched header and image",
    },
    {
      type: "bytes",
      address: 0x0003f5a8,
      original: [0x1d, 0x50, 0xf2, 0x02],
      data: [0x3e, 0x11, 0xc7, 0x45],
      description: "Update the outer CAN-DFU package CRC32",
    },
  ],
};

export default patchFile;
