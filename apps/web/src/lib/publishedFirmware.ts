import type { CollectionEntry } from "astro:content";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readPackage, type PackageManifest } from "@sdcfw/firmware-utils";

type FirmwareEntry = CollectionEntry<"firmware">;
type FirmwareFamilyEntry = CollectionEntry<"firmwareFamilies">;

export interface PublishedFirmware {
  entry: FirmwareEntry;
  data: FirmwareEntry["data"] & {
    family: string;
    variant: string;
    version: string;
    target: PackageManifest["target"];
  };
  manifest: PackageManifest;
}

const publicDir = path.resolve(process.cwd(), "public");

/** Return the source-image directory that owns a family entry. */
export function firmwareFamilyId(entry: FirmwareFamilyEntry): string {
  const suffix = "/_family";
  if (!entry.id.endsWith(suffix)) {
    throw new Error(`${entry.id}: firmware family must be named _family`);
  }
  return entry.id.slice(0, -suffix.length);
}

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
  const family = path.posix.dirname(entry.id);
  const variant = path.posix.basename(entry.id);
  if (family === ".") {
    throw new Error(`${entry.id}: firmware entry must be inside a source-image directory`);
  }

  return {
    entry,
    data: { ...entry.data, family, variant, version: manifest.version, target: manifest.target },
    manifest,
  };
}
