export {
  MANIFEST_NAME,
  MANIFEST_SCHEMA,
  TARGET_PREFIX,
  describePackage,
  packageFileName,
  type ControllerManifest,
  type DisplayManifest,
  type PackageFile,
  type PackageKind,
  type PackageManifest,
  type PackageTarget,
} from "./manifest.js";

export { sha256Hex } from "./hash.js";

export { versionMatchesAny, versionMatchesPattern } from "./compatibility.js";

export {
  buildPackage,
  type BuiltPackage,
  type ControllerBuild,
  type DisplayBuild,
  type NamedBytes,
  type PackageBuild,
} from "./build.js";

export {
  MissingManifestError,
  PackageError,
  readPackage,
  type ControllerPackage,
  type DisplayPackage,
  type FirmwarePackage,
} from "./read.js";
