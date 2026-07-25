/**
 * The patch pipeline, separated from the CLI that drives it.
 *
 * Everything here is pure: it takes a descriptor and the pristine image, and
 * returns the patched bytes. Keeping it callable is what lets tests rebuild a
 * published release and prove the archive still matches its descriptor.
 */
import crc32 from "crc-32";
import type { CleanRegion, Patch, PatchFile } from "./patches/types";

const APP_START = 0x23000;
const BL_SETTINGS_ADDR = 0x7f000;
const BANK0_IMAGE_CRC_OFFSET = 28; // Offset within bootloader settings

export type LogFn = (message: string) => void;

export interface BootloaderBank {
  imageSize: number;
  imageCrc: number;
  bankCode: number;
}

export interface BootloaderSettings {
  crc: number;
  settingsVersion: number;
  appVersion: number;
  bootloaderVersion: number;
  bankLayout: number;
  bankCurrent: number;
  bank0: BootloaderBank;
}

/** What a display patch changed, for the CLI to report. */
export interface NrfPatchSummary {
  settings: BootloaderSettings;
  originalCrc: number;
  newCrc: number;
  settingsCrc: number;
}

export interface PatchedImage {
  output: Buffer<ArrayBuffer>;
  nrf?: NrfPatchSummary;
}

/**
 * Byte width of the field a patch verifies, and of the value it writes.
 *
 * These must agree: `Buffer.copy` truncates silently, so a wider or narrower
 * payload would half-apply while still reporting success.
 */
function patchWidths(patch: Exclude<Patch, { type: "find-replace" }>): {
  original: number;
  data: number;
} {
  switch (patch.type) {
    case "string":
      return {
        original: Buffer.byteLength(patch.original, "ascii"),
        data: Buffer.byteLength(patch.data, "ascii"),
      };
    case "uint8":
      return { original: 1, data: 1 };
    case "uint16":
      return { original: 2, data: 2 };
    case "uint32":
      return { original: 4, data: 4 };
    case "bytes":
      return { original: patch.original.length, data: patch.data.length };
  }
}

export function toHex(val: number): string {
  return "0x" + val.toString(16).toUpperCase().padStart(8, "0");
}

export function readBootloaderSettings(flash: Buffer): BootloaderSettings {
  const offset = BL_SETTINGS_ADDR;

  return {
    crc: flash.readUInt32LE(offset),
    settingsVersion: flash.readUInt32LE(offset + 4),
    appVersion: flash.readUInt32LE(offset + 8),
    bootloaderVersion: flash.readUInt32LE(offset + 12),
    bankLayout: flash.readUInt32LE(offset + 16),
    bankCurrent: flash.readUInt32LE(offset + 20),
    bank0: {
      imageSize: flash.readUInt32LE(offset + 24),
      imageCrc: flash.readUInt32LE(offset + 28),
      bankCode: flash.readUInt32LE(offset + 32),
    },
  };
}

/**
 * Find all occurrences of a byte pattern in a buffer.
 * Returns an array of offsets where the pattern was found.
 */
function findAllOccurrences(haystack: Buffer, needle: Buffer): number[] {
  const offsets: number[] = [];
  let pos = 0;

  while (pos <= haystack.length - needle.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    offsets.push(idx);
    pos = idx + 1;
  }

  return offsets;
}

/**
 * Clean a firmware dump by filling with 0xFF and preserving only specified regions.
 */
function cleanFirmware(
  flash: Buffer,
  regions: CleanRegion[],
  appEnd: number,
  log: LogFn,
): Buffer<ArrayBuffer> {
  const cleaned = Buffer.alloc(flash.length, 0xff);

  for (const region of regions) {
    const start = region.start;
    const end = region.end === "appEnd" ? appEnd : region.end;

    log(`    ${region.description}: ${toHex(start)} - ${toHex(end)} (${end - start} bytes)`);

    flash.copy(cleaned, start, start, end);
  }

  return cleaned;
}

/**
 * Verify that the original bytes at the patch address match what we expect.
 * Returns null if verification passes, or an error message if it fails.
 * For find-replace patches, also returns the found address.
 */
export function verifyOriginal(
  flash: Buffer,
  patch: Patch,
  imageBase = 0,
): { error: string | null; foundAddress?: number } {
  const { type } = patch;

  // Handle find-replace separately since it doesn't have an address
  if (type === "find-replace") {
    const needle = Buffer.from(patch.find);
    const offsets = findAllOccurrences(flash, needle);

    if (offsets.length === 0) {
      return { error: "Pattern not found in firmware" };
    }
    if (offsets.length > 1) {
      return {
        error: `Pattern found ${offsets.length} times (at ${offsets.map((o) => toHex(o)).join(", ")}), expected exactly 1`,
      };
    }
    if (patch.find.length !== patch.replace.length) {
      return {
        error: `Find (${patch.find.length} bytes) and replace (${patch.replace.length} bytes) must be same length`,
      };
    }

    return { error: null, foundAddress: offsets[0]! };
  }

  const { address } = patch;
  const offset = address - imageBase;
  const width = patchWidths(patch);
  // Bounds are checked against the whole field: a uint32 two bytes from the
  // end would otherwise pass here and throw inside the reader.
  if (offset < 0 || offset + width.original > flash.length) {
    return {
      error: `Address ${toHex(address)} is outside the firmware image`,
    };
  }
  // Buffer.copy truncates silently, so a payload wider or narrower than the
  // bytes we verified would half-apply and still report success.
  if (width.data !== width.original) {
    return {
      error: `Replacement is ${width.data} bytes but the verified original is ${width.original}`,
    };
  }

  switch (type) {
    case "string": {
      const buf = Buffer.from(patch.original, "ascii");
      const actual = flash.subarray(offset, offset + buf.length);
      if (!actual.equals(buf)) {
        return {
          error: `Expected "${patch.original}" but found "${actual.toString("ascii")}"`,
        };
      }
      break;
    }

    case "uint8": {
      const actual = flash.readUInt8(offset);
      if (actual !== patch.original) {
        return {
          error: `Expected 0x${patch.original.toString(16).padStart(2, "0")} but found 0x${actual.toString(16).padStart(2, "0")}`,
        };
      }
      break;
    }

    case "uint16": {
      const actual = flash.readUInt16BE(offset);
      if (actual !== patch.original) {
        return {
          error: `Expected 0x${patch.original.toString(16).padStart(4, "0")} but found 0x${actual.toString(16).padStart(4, "0")}`,
        };
      }
      break;
    }

    case "uint32": {
      const actual = flash.readUInt32BE(offset);
      if (actual !== patch.original) {
        return {
          error: `Expected ${toHex(patch.original)} but found ${toHex(actual)}`,
        };
      }
      break;
    }

    case "bytes": {
      const original = Buffer.from(patch.original);
      const actual = flash.subarray(offset, offset + original.length);
      if (!actual.equals(original)) {
        return {
          error: `Expected [${patch.original.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")}] but found [${Array.from(
            actual,
          )
            .map((b) => "0x" + b.toString(16).padStart(2, "0"))
            .join(", ")}]`,
        };
      }
      break;
    }
  }

  return { error: null };
}

export function applyPatch(
  flash: Buffer,
  patch: Patch,
  foundAddress: number | undefined,
  imageBase: number,
  log: LogFn,
): void {
  log(`  Applying: ${patch.description}`);

  switch (patch.type) {
    case "find-replace": {
      if (foundAddress === undefined) {
        throw new Error("find-replace patch requires foundAddress from verification");
      }
      log(`    Found at: ${toHex(foundAddress)}`);
      const buf = Buffer.from(patch.replace);
      log(`    Writing: ${buf.length} bytes`);
      buf.copy(flash, foundAddress);
      break;
    }

    case "string": {
      log(`    Address: ${toHex(patch.address)}`);
      const offset = patch.address - imageBase;
      const buf = Buffer.from(patch.data, "ascii");
      log(`    Writing: "${patch.data}" (${buf.length} bytes)`);
      buf.copy(flash, offset);
      break;
    }

    case "uint8": {
      log(`    Address: ${toHex(patch.address)}`);
      const offset = patch.address - imageBase;
      log(`    Writing: 0x${patch.data.toString(16).padStart(2, "0")}`);
      flash.writeUInt8(patch.data, offset);
      break;
    }

    case "uint16": {
      log(`    Address: ${toHex(patch.address)}`);
      const offset = patch.address - imageBase;
      log(`    Writing: 0x${(patch.data & 0xffff).toString(16).padStart(4, "0")}`);
      flash.writeUInt16BE(patch.data, offset);
      break;
    }

    case "uint32": {
      log(`    Address: ${toHex(patch.address)}`);
      const offset = patch.address - imageBase;
      log(`    Writing: ${toHex(patch.data)}`);
      flash.writeUInt32BE(patch.data, offset);
      break;
    }

    case "bytes": {
      log(`    Address: ${toHex(patch.address)}`);
      const offset = patch.address - imageBase;
      const buf = Buffer.from(patch.data);
      log(`    Writing: ${buf.length} bytes`);
      buf.copy(flash, offset);
      break;
    }

    default:
      throw new Error(`Unknown patch type: ${(patch as Patch).type}`);
  }
}

/** Reject an image that is not the exact one this descriptor was written for. */
export function verifySource(patchFile: PatchFile, source: Buffer, log: LogFn = () => {}): void {
  if (patchFile.expectedSize !== undefined && source.length !== patchFile.expectedSize) {
    throw new Error(
      `Unexpected input size: ${source.length} bytes (expected ${patchFile.expectedSize})`,
    );
  }

  if (patchFile.expectedSha256) {
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(source);
    const actualSha256 = hasher.digest("hex");
    if (actualSha256 !== patchFile.expectedSha256) {
      throw new Error(
        `Input is already patched or is an unsupported firmware image.\n` +
          `  Actual SHA-256:   ${actualSha256}\n` +
          `  Expected SHA-256: ${patchFile.expectedSha256}`,
      );
    }
    log(`  SHA-256: ${actualSha256}`);
  }
}

function verifyAll(
  flash: Buffer,
  patches: Patch[],
  imageBase: number,
  log: LogFn,
): Map<Patch, number> {
  const foundAddresses = new Map<Patch, number>();
  let failed = false;

  for (const patch of patches) {
    const result = verifyOriginal(flash, patch, imageBase);
    if (result.error) {
      const location = patch.type === "find-replace" ? "" : ` at ${toHex(patch.address)}`;
      log(`  FAIL: ${patch.description}${location}: ${result.error}`);
      failed = true;
      continue;
    }
    if (result.foundAddress !== undefined) {
      foundAddresses.set(patch, result.foundAddress);
      log(`  OK: ${patch.description} (found at ${toHex(result.foundAddress)})`);
    } else {
      log(`  OK: ${patch.description}`);
    }
  }

  if (failed) {
    throw new Error(
      "Original byte verification failed; this patch is for a different firmware version.",
    );
  }
  return foundAddresses;
}

/**
 * Apply a descriptor to a pristine image.
 *
 * The source buffer is not modified. Controller images are patched as-is;
 * display dumps are additionally cleaned and have their bootloader settings
 * CRCs recomputed, or the bootloader would reject the app it now holds.
 */
export function buildPatchedImage(
  patchFile: PatchFile,
  source: Buffer,
  log: LogFn = () => {},
): PatchedImage {
  verifySource(patchFile, source, log);

  const imageBase = patchFile.imageBase ?? 0;
  let flash = Buffer.from(source);

  if (patchFile.target === "controller") {
    log("Verifying original bytes...");
    const foundAddresses = verifyAll(flash, patchFile.patches, imageBase, log);
    log("Applying patches...");
    for (const patch of patchFile.patches) {
      applyPatch(flash, patch, foundAddresses.get(patch), imageBase, log);
    }
    return { output: flash };
  }

  log("Reading bootloader settings...");
  const settings = readBootloaderSettings(flash);
  log(`  Settings Version: ${settings.settingsVersion}`);
  log(`  App Version:      ${settings.appVersion}`);
  log(`  Bank 0 image:     ${settings.bank0.imageSize} bytes`);
  log(`  Bank 0 CRC:       ${toHex(settings.bank0.imageCrc)}`);

  const appEnd = APP_START + settings.bank0.imageSize;
  if (patchFile.cleanRegions && patchFile.cleanRegions.length > 0) {
    log("Cleaning firmware dump...");
    flash = cleanFirmware(flash, patchFile.cleanRegions, appEnd, log);
  }

  const originalCrc = crc32.buf(flash.subarray(APP_START, appEnd)) >>> 0;
  log(`Original app CRC: ${toHex(originalCrc)}`);
  if (originalCrc !== settings.bank0.imageCrc) {
    log(`  Warning: does not match bootloader settings ${toHex(settings.bank0.imageCrc)}`);
  }

  log("Verifying original bytes...");
  const foundAddresses = verifyAll(flash, patchFile.patches, imageBase, log);

  log("Applying patches...");
  for (const patch of patchFile.patches) {
    applyPatch(flash, patch, foundAddresses.get(patch), imageBase, log);
  }

  const newCrc = crc32.buf(flash.subarray(APP_START, appEnd)) >>> 0;
  log(`Patched app CRC: ${toHex(newCrc)}`);

  // The bootloader checks the app against bank 0, and its own settings against
  // their CRC, so both have to be rewritten for the patched app to boot.
  flash.writeUInt32LE(newCrc, BL_SETTINGS_ADDR + BANK0_IMAGE_CRC_OFFSET);
  const settingsCrc = crc32.buf(flash.subarray(BL_SETTINGS_ADDR + 4, BL_SETTINGS_ADDR + 92)) >>> 0;
  flash.writeUInt32LE(settingsCrc, BL_SETTINGS_ADDR);
  log(`Settings CRC: ${toHex(settingsCrc)}`);

  return {
    output: flash,
    nrf: { settings, originalCrc, newCrc, settingsCrc },
  };
}
