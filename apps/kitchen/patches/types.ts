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
 * A patch file defines all patches for a specific firmware version.
 */
export interface PatchFile {
  /** Name/identifier for this patch set */
  name: string;
  /** Path to the firmware bin file (relative to project root) */
  firmwarePath: string;
  /** Postfix to add to output filename (e.g., ".patched" -> "flash.patched.bin") */
  outputPostfix: string;
  /**
   * Regions to preserve when cleaning the firmware dump.
   * If defined, the output will be filled with 0xFF except for these regions.
   * If undefined, no cleaning is performed.
   */
  cleanRegions?: CleanRegion[];
  /** List of patches to apply */
  patches: Patch[];
}
