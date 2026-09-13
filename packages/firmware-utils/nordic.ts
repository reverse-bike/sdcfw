import { strFromU8, unzipSync } from "fflate";

/** Reads the original Nordic bootloader-only archive, not an sdcfw display dump. */
export function readNordicBootloaderPackage(zip: Uint8Array): { bin: Uint8Array; dat: Uint8Array } {
  const files = unzipSync(zip);
  const raw = files["manifest.json"];
  if (!raw) throw new Error("Missing Nordic manifest.json. Select the original bootloader ZIP.");
  const manifest = JSON.parse(strFromU8(raw))?.manifest;
  if (!manifest || Object.keys(manifest).length !== 1 || !manifest.bootloader) {
    throw new Error("The ZIP must contain only a Nordic bootloader update.");
  }
  const { bin_file, dat_file } = manifest.bootloader;
  if (typeof bin_file !== "string" || typeof dat_file !== "string" || bin_file === dat_file) {
    throw new Error("Invalid bootloader manifest filenames.");
  }
  const bin = files[bin_file];
  const dat = files[dat_file];
  if (!bin?.length || !dat?.length)
    throw new Error("Bootloader binary or init packet is missing or empty.");
  return { bin, dat };
}
