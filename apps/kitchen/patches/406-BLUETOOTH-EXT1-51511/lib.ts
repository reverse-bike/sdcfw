import crc32 from "crc-32";
import type { McPatchFile, Patch } from "../types.js";

/** The pristine FTEX 5.15.11 image shared by every release in this directory. */
export const source = {
  name: "mc-406-BLUETOOTH-EXT1-51511",
  target: "controller",
  firmwarePath: "firmware/mc/406-BLUETOOTH-EXT1-51511/DFU_pack_no_IoT_5.15.11_can_only.bin",
  datPath: "firmware/mc/406-BLUETOOTH-EXT1-51511/DFU_pack_no_IoT_5.15.11_can_only.dat",
  imageBase: 0x0000ff64,
  expectedSize: 194_120,
  expectedSha256: "5cc1aeed2f71e8f3cf7c61b73515cc7644b04901a4df20ab463ca44195dfdb37",
} satisfies Omit<McPatchFile, "patches" | "release" | "finalizers">;

/**
 * Describe every copy of the version embedded in this FTEX image.
 * The returned controller version drives the archive manifest as well as the
 * bytes, so the post-flash check cannot drift from the patch definition.
 */
export function reportedVersion(controllerVersion: number): {
  controllerVersion: number;
  patches: Patch[];
} {
  const major = Math.floor(controllerVersion / 10_000);
  const minor = Math.floor(controllerVersion / 100) % 100;
  const patch = controllerVersion % 100;
  const original = [0x05, 0x0f, 0x0b, 0x00];
  const data = [major, minor, patch, 0x00];
  const from = "5.15.11";
  const to = `${major}.${minor}.${patch}`;

  return {
    controllerVersion,
    patches: [
      {
        type: "bytes",
        address: 0x0000ff64,
        original,
        data,
        description: `Bump the outer package version from ${from} to ${to}`,
      },
      {
        type: "bytes",
        address: 0x0000ff70,
        original,
        data,
        description: `Bump the outer target-image version from ${from} to ${to}`,
      },
      {
        type: "bytes",
        address: 0x00010014,
        original: [...original, ...original],
        data: [...data, ...data],
        description: `Bump the MCUboot image version from ${from} to ${to}`,
      },
    ],
  };
}

/** Calculate the MCUboot SHA-256 TLV from the fully patched image body. */
export function sha256TlvPatch(image: Buffer<ArrayBuffer>): Patch {
  const imageStart = 0x00010000 - source.imageBase;
  const tlvStart = 0x0003f580 - source.imageBase;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(image.subarray(imageStart, tlvStart));

  return {
    type: "bytes",
    address: 0x0003f588,
    original: Array.from(
      Uint8Array.fromHex("374483dce91f9b02d2d234adca6718fdde36fee9a03f1e87d25f5dd520f51d80"),
    ),
    data: Array.from(hasher.digest()),
    description: "Update the MCUboot SHA-256 TLV for the patched image",
  };
}

/** Calculate the outer CAN-DFU CRC after the MCUboot digest has been updated. */
export function outerCrcPatch(image: Buffer<ArrayBuffer>): Patch {
  const crc = crc32.buf(image.subarray(0, -4)) >>> 0;
  const data = Buffer.alloc(4);
  data.writeUInt32LE(crc);

  return {
    type: "bytes",
    address: 0x0003f5a8,
    original: [0x1d, 0x50, 0xf2, 0x02],
    data: Array.from(data),
    description: "Update the outer CAN-DFU package CRC32",
  };
}
