import { describePackage, readPackage } from "@sdcfw/firmware-utils";

export interface ControllerFirmware {
  bin: Uint8Array;
  dat: Uint8Array;
  binLabel: string;
  datLabel: string;
  description?: string;
}

/** Read the controller payload from a verified Kitchen firmware archive. */
export async function readControllerArchive(
  zip: Uint8Array,
  archiveLabel: string,
): Promise<ControllerFirmware> {
  const firmware = await readPackage(zip);
  if (firmware.target !== "controller") {
    throw new Error(
      `${archiveLabel} targets the display; mc-farm only flashes motor-controller archives`,
    );
  }

  return {
    bin: firmware.bin,
    dat: firmware.dat,
    binLabel: `${archiveLabel}:${firmware.manifest.files.bin.name}`,
    datLabel: `${archiveLabel}:${firmware.manifest.files.dat.name}`,
    description: describePackage(firmware.manifest),
  };
}
