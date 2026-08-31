import type { CollectionEntry } from "astro:content";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readPackage, type PackageManifest } from "@sdcfw/firmware-utils";

type FirmwareEntry = CollectionEntry<"firmware">;

export interface PublishedFirmware {
  entry: FirmwareEntry;
  data: FirmwareEntry["data"] & {
    version: string;
    target: PackageManifest["target"];
  };
  manifest: PackageManifest;
}

const publicDir = path.resolve(process.cwd(), "public");

/**
 * Read immutable release facts from the archive that the content entry links.
 */
export async function readPublishedFirmware(entry: FirmwareEntry): Promise<PublishedFirmware> {
  if (!entry.data.path.startsWith("/")) {
    throw new Error(`${entry.id}: firmware path must start with /`);
  }

  const archivePath = path.join(publicDir, entry.data.path.slice(1));
  const firmware = await readPackage(new Uint8Array(await readFile(archivePath)));
  const manifest = firmware.manifest;

  return {
    entry,
    data: { ...entry.data, version: manifest.version, target: manifest.target },
    manifest,
  };
}
