#!/usr/bin/env bun
/**
 * nRF52 Firmware Patcher
 *
 * Patches application code and updates CRC32 checksums in bootloader settings.
 *
 * Usage: bun run main.ts <patch-file.ts>
 * Output: <firmware-dir>/<firmware-name><postfix>.bin
 */

import fs from "fs";
import path from "path";
import crc32 from "crc-32";
import type { CleanRegion, Patch, PatchFile } from "./patches/types";

// ============================================================================
// TYPES
// ============================================================================

interface BootloaderBank {
  imageSize: number;
  imageCrc: number;
  bankCode: number;
}

interface BootloaderSettings {
  crc: number;
  settingsVersion: number;
  appVersion: number;
  bootloaderVersion: number;
  bankLayout: number;
  bankCurrent: number;
  bank0: BootloaderBank;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const APP_START = 0x23000;
const BL_SETTINGS_ADDR = 0x7f000;
const BANK0_IMAGE_CRC_OFFSET = 28; // Offset within bootloader settings

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function toHex(val: number): string {
  return "0x" + val.toString(16).toUpperCase().padStart(8, "0");
}

function readBootloaderSettings(flash: Buffer): BootloaderSettings {
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
 * Clean a firmware dump by filling with 0xFF and preserving only specified regions.
 */
function cleanFirmware(
  flash: Buffer,
  regions: CleanRegion[],
  appEnd: number,
): Buffer {
  const cleaned = Buffer.alloc(flash.length, 0xff);

  for (const region of regions) {
    const start = region.start;
    const end = region.end === "appEnd" ? appEnd : region.end;

    console.log(
      `    ${region.description}: ${toHex(start)} - ${toHex(end)} (${end - start} bytes)`,
    );

    flash.copy(cleaned, start, start, end);
  }

  return cleaned;
}

/**
 * Verify that the original bytes at the patch address match what we expect.
 * Returns null if verification passes, or an error message if it fails.
 */
function verifyOriginal(flash: Buffer, patch: Patch): string | null {
  const { address, type } = patch;

  switch (type) {
    case "string": {
      const buf = Buffer.from(patch.original, "ascii");
      const actual = flash.subarray(address, address + buf.length);
      if (!actual.equals(buf)) {
        return `Expected "${patch.original}" but found "${actual.toString("ascii")}"`;
      }
      break;
    }

    case "uint8": {
      const actual = flash.readUInt8(address);
      if (actual !== patch.original) {
        return `Expected 0x${patch.original.toString(16).padStart(2, "0")} but found 0x${actual.toString(16).padStart(2, "0")}`;
      }
      break;
    }

    case "uint16": {
      const actual = flash.readUInt16BE(address);
      if (actual !== patch.original) {
        return `Expected 0x${patch.original.toString(16).padStart(4, "0")} but found 0x${actual.toString(16).padStart(4, "0")}`;
      }
      break;
    }

    case "uint32": {
      const actual = flash.readUInt32BE(address);
      if (actual !== patch.original) {
        return `Expected ${toHex(patch.original)} but found ${toHex(actual)}`;
      }
      break;
    }

    case "bytes": {
      const original = Buffer.from(patch.original);
      const actual = flash.subarray(address, address + original.length);
      if (!actual.equals(original)) {
        return `Expected [${patch.original.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")}] but found [${Array.from(actual).map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")}]`;
      }
      break;
    }
  }

  return null;
}

function applyPatch(flash: Buffer, patch: Patch): void {
  const { address, type, data, description } = patch;

  console.log(`  Applying: ${description}`);
  console.log(`    Address: ${toHex(address)}`);

  switch (type) {
    case "string": {
      const buf = Buffer.from(data, "ascii");
      console.log(`    Writing: "${data}" (${buf.length} bytes)`);
      buf.copy(flash, address);
      break;
    }

    case "uint8": {
      console.log(`    Writing: 0x${data.toString(16).padStart(2, "0")}`);
      flash.writeUInt8(data, address);
      break;
    }

    case "uint16": {
      console.log(
        `    Writing: 0x${(data & 0xffff).toString(16).padStart(4, "0")}`,
      );
      flash.writeUInt16BE(data, address);
      break;
    }

    case "uint32": {
      console.log(`    Writing: ${toHex(data)}`);
      flash.writeUInt32BE(data, address);
      break;
    }

    case "bytes": {
      const buf = Buffer.from(data);
      console.log(`    Writing: ${buf.length} bytes`);
      buf.copy(flash, address);
      break;
    }

    default:
      throw new Error(`Unknown patch type: ${(patch as Patch).type}`);
  }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

async function main(): Promise<void> {
  // Parse arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun run main.ts <patch-file.ts>");
    console.error("");
    console.error("Example: bun run main.ts ./patches/nrf-6-221122-0.ts");
    process.exit(1);
  }

  const patchFilePath = args[0];

  if (!patchFilePath || !fs.existsSync(patchFilePath)) {
    console.error(`Error: Patch file not found: ${patchFilePath}`);
    process.exit(1);
  }

  // Load patch file
  console.log("nRF52 Firmware Patcher");
  console.log("=====================\n");

  console.log("Step 1: Loading patch file...");
  const patchModule = await import(path.resolve(patchFilePath));
  const patchFile: PatchFile = patchModule.default;

  console.log(`  Name: ${patchFile.name}`);
  console.log(`  Firmware: ${patchFile.firmwarePath}`);
  console.log(`  Output postfix: ${patchFile.outputPostfix}`);
  console.log(`  Patches: ${patchFile.patches.length}\n`);

  // Resolve firmware path relative to project root
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const projectRoot = path.resolve(currentDir, "../..");
  const firmwarePath = path.resolve(projectRoot, patchFile.firmwarePath);

  if (!fs.existsSync(firmwarePath)) {
    console.error(`Error: Firmware file not found: ${firmwarePath}`);
    process.exit(1);
  }

  // Compute output path (same directory as firmware, with postfix)
  const firmwareDir = path.dirname(firmwarePath);
  const firmwareBasename = path.basename(firmwarePath, ".bin");
  const outputPath = path.join(
    firmwareDir,
    `${firmwareBasename}${patchFile.outputPostfix}.bin`,
  );

  console.log(`Input:  ${firmwarePath}`);
  console.log(`Output: ${outputPath}\n`);

  // Read input file
  console.log("Step 2: Reading input file...");
  let flash = fs.readFileSync(firmwarePath);
  console.log(
    `  Size: ${flash.length} bytes (${(flash.length / 1024).toFixed(1)} KB)\n`,
  );

  // Read bootloader settings
  console.log("Step 3: Reading bootloader settings...");
  const blSettings = readBootloaderSettings(flash);

  console.log(`  Settings Version: ${blSettings.settingsVersion}`);
  console.log(`  App Version:      ${blSettings.appVersion}`);
  console.log(`  Bank 0:`);
  console.log(
    `    Image Size: ${blSettings.bank0.imageSize} bytes (${(blSettings.bank0.imageSize / 1024).toFixed(1)} KB)`,
  );
  console.log(`    Image CRC:  ${toHex(blSettings.bank0.imageCrc)}`);
  console.log(`    Bank Code:  ${toHex(blSettings.bank0.bankCode)}\n`);

  // Clean firmware if cleanRegions is defined
  const appEnd = APP_START + blSettings.bank0.imageSize;
  if (patchFile.cleanRegions && patchFile.cleanRegions.length > 0) {
    console.log("Step 4: Cleaning firmware dump...");
    console.log("  Preserving regions:");
    flash = cleanFirmware(flash, patchFile.cleanRegions, appEnd) as typeof flash;
    console.log();
  }

  // Calculate original CRC
  console.log("Step 5: Calculating original app CRC...");
  const appData = flash.subarray(
    APP_START,
    APP_START + blSettings.bank0.imageSize,
  );
  const originalCrc = crc32.buf(appData) >>> 0;

  console.log(`  App Start:    ${toHex(APP_START)}`);
  console.log(`  App Size:     ${blSettings.bank0.imageSize} bytes`);
  console.log(
    `  App End:      ${toHex(APP_START + blSettings.bank0.imageSize)}`,
  );
  console.log(`  Original CRC: ${toHex(originalCrc)}`);

  if (originalCrc !== blSettings.bank0.imageCrc) {
    console.log(`  Warning: CRC mismatch!`);
    console.log(`    Expected: ${toHex(blSettings.bank0.imageCrc)}`);
    console.log(`    Got:      ${toHex(originalCrc)}`);
  } else {
    console.log(`  CRC matches bootloader settings\n`);
  }

  // Verify original bytes before patching
  console.log("Step 6: Verifying original bytes...");
  let verificationFailed = false;
  for (const patch of patchFile.patches) {
    const error = verifyOriginal(flash, patch);
    if (error) {
      console.log(`  FAIL: ${patch.description}`);
      console.log(`    At ${toHex(patch.address)}: ${error}`);
      verificationFailed = true;
    } else {
      console.log(`  OK: ${patch.description}`);
    }
  }

  if (verificationFailed) {
    console.error(
      "\nError: Original byte verification failed. Aborting patch.",
    );
    console.error(
      "This patch file may be for a different firmware version.\n",
    );
    process.exit(1);
  }
  console.log();

  // Apply patches
  console.log("Step 7: Applying patches...");
  if (patchFile.patches.length === 0) {
    console.log("  No patches defined.\n");
  } else {
    for (const patch of patchFile.patches) {
      applyPatch(flash, patch);
    }
    console.log();
  }

  // Calculate new CRC
  console.log("Step 8: Calculating new app CRC...");
  const patchedAppData = flash.subarray(
    APP_START,
    APP_START + blSettings.bank0.imageSize,
  );
  const newCrc = crc32.buf(patchedAppData) >>> 0;

  console.log(`  New CRC: ${toHex(newCrc)}\n`);

  // Update Bank 0 Image CRC in bootloader settings
  console.log("Step 9: Updating bootloader settings...");
  const bank0CrcAddr = BL_SETTINGS_ADDR + BANK0_IMAGE_CRC_OFFSET;

  console.log(`  Bank 0 Image CRC address: ${toHex(bank0CrcAddr)}`);
  console.log(`  Old value: ${toHex(flash.readUInt32LE(bank0CrcAddr))}`);

  flash.writeUInt32LE(newCrc, bank0CrcAddr);

  console.log(`  New value: ${toHex(flash.readUInt32LE(bank0CrcAddr))}\n`);

  // Recalculate bootloader settings CRC
  console.log("Step 10: Recalculating bootloader settings CRC...");
  const settingsData = flash.subarray(
    BL_SETTINGS_ADDR + 4,
    BL_SETTINGS_ADDR + 92,
  );
  const settingsCrc = crc32.buf(settingsData) >>> 0;

  console.log(
    `  Old settings CRC: ${toHex(flash.readUInt32LE(BL_SETTINGS_ADDR))}`,
  );
  console.log(`  New settings CRC: ${toHex(settingsCrc)}`);

  flash.writeUInt32LE(settingsCrc, BL_SETTINGS_ADDR);
  console.log(`  Updated\n`);

  // Write output file
  console.log("Step 11: Writing patched firmware...");
  fs.writeFileSync(outputPath, flash);
  console.log(`  Saved to: ${outputPath}\n`);

  // Summary
  console.log("Summary:");
  console.log("========");
  console.log(`  Patches applied:     ${patchFile.patches.length}`);
  console.log(`  Original app CRC:    ${toHex(originalCrc)}`);
  console.log(`  Patched app CRC:     ${toHex(newCrc)}`);
  console.log(`  Settings CRC:        ${toHex(settingsCrc)}`);
  console.log(`\nPatching complete!\n`);
  console.log(`To flash the patched firmware:`);
  console.log(`  bun run farm erase`);
  console.log(`  bun run farm restore ${outputPath} ./patched_backup/metadata.json`);
}

main();
