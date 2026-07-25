import { zipSync } from "fflate";
import { sha256Hex } from "./hash.js";
import {
  MANIFEST_NAME,
  MANIFEST_SCHEMA,
  packageFileName,
  type PackageFile,
  type PackageKind,
  type PackageManifest,
} from "./manifest.js";

/** A file to place in the archive. */
export interface NamedBytes {
  name: string;
  data: Uint8Array;
}

interface BuildBase {
  /** Release version of the archive */
  version: string;
  /** Whether the primary image was modified */
  kind: PackageKind;
  /** The pristine image the release was built from */
  source: NamedBytes;
}

export interface ControllerBuild extends BuildBase {
  target: "controller";
  bin: NamedBytes;
  dat: NamedBytes;
  /** Version the image reports over BLE once running */
  controllerVersion: number;
}

export interface DisplayBuild extends BuildBase {
  target: "nrf";
  flash: NamedBytes;
  uicr: NamedBytes;
  /** Version the image reports through the Device Information Service */
  nrfVersion: string;
}

export type PackageBuild = ControllerBuild | DisplayBuild;

export interface BuiltPackage {
  /** Composed archive filename */
  fileName: string;
  manifest: PackageManifest;
  zip: Uint8Array;
}

async function describe(file: NamedBytes): Promise<PackageFile> {
  return { name: file.name, sha256: await sha256Hex(file.data) };
}

/** Build a firmware archive: the image, its companion file, and the manifest. */
export async function buildPackage(build: PackageBuild): Promise<BuiltPackage> {
  const source = await describe(build.source);
  const entries: NamedBytes[] =
    build.target === "controller" ? [build.bin, build.dat] : [build.flash, build.uicr];

  const manifest: PackageManifest =
    build.target === "controller"
      ? {
          schema: MANIFEST_SCHEMA,
          version: build.version,
          target: "controller",
          files: { bin: await describe(build.bin), dat: await describe(build.dat) },
          source,
          provides: { controllerVersion: build.controllerVersion },
        }
      : {
          schema: MANIFEST_SCHEMA,
          version: build.version,
          target: "nrf",
          files: { flash: await describe(build.flash), uicr: await describe(build.uicr) },
          source,
          provides: { nrfVersion: build.nrfVersion },
        };

  if (build.kind === "stock") {
    const primary = manifest.target === "controller" ? manifest.files.bin : manifest.files.flash;
    if (primary.sha256 !== source.sha256) {
      throw new Error(
        "stock release does not match its source image; a descriptor with no patches must " +
          "reproduce its input exactly",
      );
    }
  }

  // Entry timestamps are left to the zip writer. Only file contents matter, and
  // those are pinned by the manifest hashes.
  const contents: Record<string, Uint8Array> = {
    [MANIFEST_NAME]: new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
  };
  for (const entry of entries) {
    contents[entry.name] = entry.data;
  }

  return {
    fileName: packageFileName({
      target: build.target,
      reportedVersion: build.target === "controller" ? build.controllerVersion : build.nrfVersion,
      kind: build.kind,
      version: build.version,
    }),
    manifest,
    zip: zipSync(contents, { level: 9 }),
  };
}
