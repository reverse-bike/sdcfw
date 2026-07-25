/** Name of our manifest inside a firmware archive. */
export const MANIFEST_NAME = "sdcfw.json";

/** Manifest layout this build understands. A mismatch is a hard error. */
export const MANIFEST_SCHEMA = 1;

export type PackageTarget = "controller" | "nrf";

/** Filename prefix each target uses in composed archive names. */
export const TARGET_PREFIX: Record<PackageTarget, string> = {
  controller: "mc",
  nrf: "nrf",
};

/** Whether an archive carries a modified image or the pristine one. */
export type PackageKind = "patched" | "stock";

/** A file inside the archive, identified by name and verified by hash. */
export interface PackageFile {
  /** Entry name inside the archive */
  name: string;
  /** Lowercase hex SHA-256 of the raw bytes */
  sha256: string;
}

interface ManifestBase {
  schema: number;
  /** Release version of the archive itself, unrelated to any firmware version */
  version: string;
  /** The pristine image this release was built from */
  source: PackageFile;
}

export interface ControllerManifest extends ManifestBase {
  target: "controller";
  files: { bin: PackageFile; dat: PackageFile };
  /** What the image reports once running; the post-flash success signal */
  provides: { controllerVersion: number };
}

export interface DisplayManifest extends ManifestBase {
  target: "nrf";
  files: { flash: PackageFile; uicr: PackageFile };
  provides: { nrfVersion: string };
}

export type PackageManifest = ControllerManifest | DisplayManifest;

/**
 * Compose an archive filename.
 *
 * The name is for humans and for linking. Nothing parses it back into its
 * parts; identity for machines lives in the manifest.
 */
export function packageFileName(options: {
  target: PackageTarget;
  reportedVersion: string | number;
  kind: PackageKind;
  version: string;
}): string {
  const prefix = TARGET_PREFIX[options.target];
  return `${prefix}-${options.reportedVersion}-${options.kind}-v${options.version}.zip`;
}

/** Human label for an archive, usable when no content entry is available. */
export function describePackage(manifest: PackageManifest): string {
  const reported =
    manifest.target === "controller"
      ? `controller ${manifest.provides.controllerVersion}`
      : `display ${manifest.provides.nrfVersion}`;
  return `${reported} (release ${manifest.version})`;
}
