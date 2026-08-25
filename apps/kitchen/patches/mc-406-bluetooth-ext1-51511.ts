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
    version: "1.0.4",
    controllerVersion: 51_514,
  },
  patches: [
    {
      type: "bytes",
      address: 0x0000ff64,
      original: [0x05, 0x0f, 0x0b, 0x00],
      data: [0x05, 0x0f, 0x0e, 0x00],
      description: "Bump the outer package version from 5.15.11 to 5.15.14",
    },
    {
      type: "bytes",
      address: 0x0000ff70,
      original: [0x05, 0x0f, 0x0b, 0x00],
      data: [0x05, 0x0f, 0x0e, 0x00],
      description: "Bump the outer target-image version from 5.15.11 to 5.15.14",
    },
    {
      type: "bytes",
      address: 0x00010014,
      original: [0x05, 0x0f, 0x0b, 0x00, 0x05, 0x0f, 0x0b, 0x00],
      data: [0x05, 0x0f, 0x0e, 0x00, 0x05, 0x0f, 0x0e, 0x00],
      description: "Bump the MCUboot image version from 5.15.11 to 5.15.14",
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
      data: [0x4b],
      description: "Raise the baked vehicle speed ceiling from 32 to 75 km/h",
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
      description: "Raise the baked motor electrical-speed limit from 2500 to 3000",
    },
    {
      type: "bytes",
      address: 0x0003f588,
      original: Array.from(
        Uint8Array.fromHex("374483dce91f9b02d2d234adca6718fdde36fee9a03f1e87d25f5dd520f51d80"),
      ),
      data: Array.from(
        Uint8Array.fromHex("8ddf187a0705e9eaab00f47b2ad0d276893584be090c579fa6bb063c4b7a95ec"),
      ),
      description: "Update the MCUboot SHA-256 TLV for the patched image",
    },
    {
      type: "bytes",
      address: 0x0003f5a8,
      original: [0x1d, 0x50, 0xf2, 0x02],
      data: [0xd1, 0x6a, 0x9d, 0x99],
      description: "Update the outer CAN-DFU package CRC32",
    },
  ],
};

export default patchFile;
