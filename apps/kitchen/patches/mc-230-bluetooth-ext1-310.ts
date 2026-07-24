import type { PatchFile } from "./types.js";

const patchFile: PatchFile = {
  name: "mc-230-BLUETOOTH-EXT1-310",
  firmwarePath:
    "firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin",
  outputPostfix: ".patched",
  format: "raw",
  imageBase: 0x08003800,
  expectedSize: 26_200,
  expectedSha256:
    "90d8bb178b308900375416f319e59f043b3363c158f2bec4dc6bbdb879f97840",
  patches: [
    {
      type: "bytes",
      address: 0x08005e3a,
      original: [0x1b, 0xb1, 0x72, 0xb6],
      data: [0x03, 0x24, 0x02, 0xe0],
      description: "Initialize internal operating mode to 3",
    },
    {
      type: "bytes",
      address: 0x08007e02,
      original: [0x0a, 0x23],
      data: [0x0b, 0x23],
      description: "Report controller version 311 on CAN 0x266",
    },
    {
      type: "bytes",
      address: 0x0800937c,
      original: Array.from(
        Uint8Array.fromHex(
          "2179017065798248a52d0cd002708148a679056856b145f00805056004290dd245f4005109e03c250570f0e725f008050560042902d225f400510160",
        ),
      ),
      data: Array.from(
        Uint8Array.fromHex(
          "217a00290cbf01210321017065790848a52d0cbf3c25002505700648056842f20801a6790eb10d4300e08d43056003e015000020dc00002000bf00bf",
        ),
      ),
      description: "Select internal mode 1/3 from CAN 0x300 assist level",
    },
    {
      type: "bytes",
      address: 0x08006e2c,
      original: [0x0c, 0xd2],
      data: [0x00, 0xbf],
      description: "Disable mode 3/7 throttle current-ceiling speed roll-off",
    },
    {
      type: "bytes",
      address: 0x0800664e,
      original: [0x6e, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 low-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08006652,
      original: [0x46, 0x22],
      data: [0x96, 0x22],
      description: "Set mode 3 high-speed throttle rise rate to 150",
    },
    {
      type: "bytes",
      address: 0x08005c9a,
      original: [0x26, 0x24],
      data: [0x4c, 0x24],
      description: "Double q-axis current-command filter coefficient",
    },
  ],
};

export default patchFile;
