/**
 * Patch file types for firmware patching.
 *
 * Numeric values (uint16, uint32) are specified as they appear in a hex viewer.
 * For example, if you see bytes "01 23" at an address, specify 0x0123.
 */

interface PatchBase {
  /** Memory address to patch */
  address: number;
  /** Human-readable description of the patch */
  description: string;
}

export interface PatchString extends PatchBase {
  type: "string";
  /** Original string at this address (for verification) */
  original: string;
  /** New string to write */
  data: string;
}

export interface PatchUInt8 extends PatchBase {
  type: "uint8";
  /** Original byte at this address (for verification) */
  original: number;
  /** New byte to write */
  data: number;
}

export interface PatchUInt16 extends PatchBase {
  type: "uint16";
  /** Original 16-bit value at this address (as seen in hex viewer, e.g., 0x0123 for bytes "01 23") */
  original: number;
  /** New 16-bit value to write (as seen in hex viewer) */
  data: number;
}

export interface PatchUInt32 extends PatchBase {
  type: "uint32";
  /** Original 32-bit value at this address (as seen in hex viewer) */
  original: number;
  /** New 32-bit value to write (as seen in hex viewer) */
  data: number;
}

export interface PatchBytes extends PatchBase {
  type: "bytes";
  /** Original bytes at this address (for verification) */
  original: number[];
  /** New bytes to write */
  data: number[];
}

/**
 * Find bytes in the firmware and replace them.
 * Useful when the address may vary between firmware versions.
 * Will error if the pattern is not found or found multiple times.
 */
export interface PatchFindReplace {
  type: "find-replace";
  /** Bytes to search for (will verify exactly one match exists) */
  find: number[];
  /** Bytes to replace with (must be same length as find) */
  replace: number[];
  /** Human-readable description of the patch */
  description: string;
}

export type Patch =
  | PatchString
  | PatchUInt8
  | PatchUInt16
  | PatchUInt32
  | PatchBytes
  | PatchFindReplace;

/**
 * A region to preserve during cleaning.
 * Everything outside these regions will be filled with 0xFF.
 */
export interface CleanRegion {
  /** Start address (inclusive) */
  start: number;
  /** End address (exclusive), or "auto" to use app size from DFU settings */
  end: number | "appEnd";
  /** Description of this region */
  description: string;
}

/**
 * Marks a descriptor as one that ships as a firmware archive.
 *
 * Release metadata describes the *output* image. Provenance, meaning which
 * firmware was patched to produce it, is carried by the patch file's `name`.
 *
 * Kitchen composes the archive filename from these fields and the target; the
 * name is for humans and for linking, and is never parsed to recover them.
 */
export interface ReleaseInfo {
  /** Release version of the archive itself, unrelated to any firmware version */
  version: string;
}

/**
 * Fields shared by every patch file, whatever the target device.
 *
 * Each target follows the same shape: a primary image that gets patched, plus
 * one companion file that ships beside it unmodified.
 */
interface PatchFileBase {
  /** Name/identifier for this patch set */
  name: string;
  /** Path to the firmware bin file (relative to project root) */
  firmwarePath: string;
  /** Memory address corresponding to file offset zero. Defaults to zero. */
  imageBase?: number;
  /** List of patches to apply. Empty for a stock release. */
  patches: Patch[];
  /** Set to publish this descriptor's output as a firmware archive. */
  release?: ReleaseInfo;
}

/**
 * Display firmware: a full nRF52 flash dump, patched in place, shipping
 * alongside the UICR dump taken from the same device.
 */
export interface NrfPatchFile extends PatchFileBase {
  target: "nrf";
  /** Path to the matching UICR dump (relative to project root) */
  uicrPath: string;
  /** Display releases additionally declare the version the image reports. */
  release?: ReleaseInfo & {
    /**
     * Version this image reports, as a string because the display exposes it
     * through the BLE Device Information Service. Patching cannot safely change
     * it, so it matches the source image.
     */
    nrfVersion: string;
  };
  /** Exact pristine input size, used to reject unknown images. */
  expectedSize?: number;
  /** Exact pristine input SHA-256, used to reject patched or unknown images. */
  expectedSha256?: string;
  /**
   * Regions to preserve when cleaning the firmware dump.
   * If defined, the output will be filled with 0xFF except for these regions.
   * If undefined, no cleaning is performed.
   */
  cleanRegions?: CleanRegion[];
}

/**
 * Motor controller firmware: a raw image needing no cleaning, shipping
 * alongside the signed DFU init packet used to stage it.
 *
 * Size and hash are mandatory here: a controller image is never patched
 * without verifying what went in, and it cannot be read back off the bike.
 */
export interface McPatchFile extends PatchFileBase {
  target: "controller";
  /** Path to the DFU init packet shipped with this image (relative to project root) */
  datPath: string;
  /** Exact pristine input size */
  expectedSize: number;
  /** Exact pristine input SHA-256 */
  expectedSha256: string;
  /** Controller releases additionally declare the version the image reports over BLE. */
  release?: ReleaseInfo & {
    /**
     * Version this image reports over BLE once running, used to verify a flash
     * succeeded. Declared by hand and deliberately not derived from the patches.
     */
    controllerVersion: number;
  };
}

/**
 * A patch file defines all patches for a specific firmware version.
 */
export type PatchFile = NrfPatchFile | McPatchFile;
