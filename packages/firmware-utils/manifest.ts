/** Name of our manifest inside a firmware archive. */
export const MANIFEST_NAME = "sdcfw.json";

/** Manifest layout this build understands. A mismatch is a hard error. */
export const MANIFEST_SCHEMA = 1;

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

/** Human label for an archive, usable when no content entry is available. */
export function describePackage(manifest: PackageManifest): string {
  const reported =
    manifest.target === "controller"
      ? `controller ${manifest.provides.controllerVersion}`
      : `display ${manifest.provides.nrfVersion}`;
  return `${reported} (release ${manifest.version})`;
}
