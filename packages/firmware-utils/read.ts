import { unzipSync } from "fflate";
import { sha256Hex } from "./hash.js";
import {
  MANIFEST_NAME,
  MANIFEST_SCHEMA,
  type ControllerManifest,
  type DisplayManifest,
  type PackageFile,
  type PackageManifest,
} from "./manifest.js";

export class PackageError extends Error {}

/** Thrown when an archive carries no manifest, so callers can offer a fallback. */
export class MissingManifestError extends PackageError {
  constructor() {
    super(`archive has no ${MANIFEST_NAME}; it is not a firmware package from this project`);
  }
}

export interface ControllerPackage {
  target: "controller";
  manifest: ControllerManifest;
  bin: Uint8Array;
  dat: Uint8Array;
}

export interface DisplayPackage {
  target: "nrf";
  manifest: DisplayManifest;
  flash: Uint8Array;
  uicr: Uint8Array;
}

export type FirmwarePackage = ControllerPackage | DisplayPackage;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new PackageError(`manifest field "${field}" must be a non-empty string`);
  }
  return value;
}

function requireFile(value: unknown, field: string): PackageFile {
  if (typeof value !== "object" || value === null) {
    throw new PackageError(`manifest field "${field}" must be an object`);
  }
  const entry = value as Record<string, unknown>;
  return {
    name: requireString(entry["name"], `${field}.name`),
    sha256: requireString(entry["sha256"], `${field}.sha256`).toLowerCase(),
  };
}

function parseManifest(raw: unknown): PackageManifest {
  if (typeof raw !== "object" || raw === null) {
    throw new PackageError("manifest is not an object");
  }
  const value = raw as Record<string, unknown>;

  if (value["schema"] !== MANIFEST_SCHEMA) {
    throw new PackageError(
      `unsupported manifest schema ${String(value["schema"])}; this build understands ${MANIFEST_SCHEMA}`,
    );
  }
  const version = requireString(value["version"], "version");
  const source = requireFile(value["source"], "source");
  const files = value["files"];
  if (typeof files !== "object" || files === null) {
    throw new PackageError('manifest field "files" must be an object');
  }
  const entries = files as Record<string, unknown>;
  const provides = value["provides"];
  if (typeof provides !== "object" || provides === null) {
    throw new PackageError('manifest field "provides" must be an object');
  }
  const reported = provides as Record<string, unknown>;

  switch (value["target"]) {
    case "controller": {
      const controllerVersion = reported["controllerVersion"];
      if (typeof controllerVersion !== "number" || !Number.isInteger(controllerVersion)) {
        throw new PackageError('manifest field "provides.controllerVersion" must be an integer');
      }
      return {
        schema: MANIFEST_SCHEMA,
        version,
        target: "controller",
        files: {
          bin: requireFile(entries["bin"], "files.bin"),
          dat: requireFile(entries["dat"], "files.dat"),
        },
        source,
        provides: { controllerVersion },
      };
    }
    case "nrf":
      return {
        schema: MANIFEST_SCHEMA,
        version,
        target: "nrf",
        files: {
          flash: requireFile(entries["flash"], "files.flash"),
          uicr: requireFile(entries["uicr"], "files.uicr"),
        },
        source,
        provides: { nrfVersion: requireString(reported["nrfVersion"], "provides.nrfVersion") },
      };
    default:
      throw new PackageError(`unknown package target: ${String(value["target"])}`);
  }
}

async function take(
  contents: Record<string, Uint8Array>,
  file: PackageFile,
  role: string,
): Promise<Uint8Array> {
  // Own-property check: a manifest naming "constructor" would otherwise pick up
  // Object.prototype and fail deep inside hashing rather than as a PackageError.
  const data = Object.hasOwn(contents, file.name) ? contents[file.name] : undefined;
  if (!data) {
    throw new PackageError(`archive is missing its ${role} file "${file.name}"`);
  }
  const actual = await sha256Hex(data);
  if (actual !== file.sha256) {
    throw new PackageError(
      `${role} file "${file.name}" does not match its manifest hash\n` +
        `  expected ${file.sha256}\n` +
        `  actual   ${actual}`,
    );
  }
  return data;
}

/**
 * Parse a firmware archive and verify every file against its manifest hash.
 *
 * Throws {@link MissingManifestError} for archives that carry no manifest,
 * which callers may treat as an unverified package rather than a failure.
 */
export async function readPackage(zip: Uint8Array): Promise<FirmwarePackage> {
  let contents: Record<string, Uint8Array>;
  try {
    contents = unzipSync(zip);
  } catch (cause) {
    throw new PackageError(
      `could not read the archive: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const manifestBytes = Object.hasOwn(contents, MANIFEST_NAME)
    ? contents[MANIFEST_NAME]
    : undefined;
  if (!manifestBytes) throw new MissingManifestError();

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch (cause) {
    throw new PackageError(
      `${MANIFEST_NAME} is not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  const manifest = parseManifest(raw);
  if (manifest.target === "controller") {
    return {
      target: "controller",
      manifest,
      bin: await take(contents, manifest.files.bin, "firmware"),
      dat: await take(contents, manifest.files.dat, "init packet"),
    };
  }
  return {
    target: "nrf",
    manifest,
    flash: await take(contents, manifest.files.flash, "flash"),
    uicr: await take(contents, manifest.files.uicr, "UICR"),
  };
}
