#!/usr/bin/env bun
/**
 * nRF52 Firmware Patcher
 *
 * Patches application code and updates CRC32 checksums in bootloader settings.
 *
 * Usage: tsx patch-firmware.ts <input.bin>
 * Output: <input>.patched.bin
 */

import fs from "fs";
import crc32 from "crc-32";

// ============================================================================
// TYPES
// ============================================================================

interface PatchString {
  address: number;
  type: "string";
  data: string;
  description: string;
}

interface PatchUInt8 {
  address: number;
  type: "uint8";
  data: number;
  description: string;
}

interface PatchUInt16LE {
  address: number;
  type: "uint16le";
  data: number;
  description: string;
}

interface PatchUInt32LE {
  address: number;
  type: "uint32le";
  data: number;
  description: string;
}

interface PatchBytes {
  address: number;
  type: "bytes";
  data: Buffer;
  description: string;
}

type Patch =
  | PatchString
  | PatchUInt8
  | PatchUInt16LE
  | PatchUInt32LE
  | PatchBytes;

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
// PATCH DEFINITIONS - MODIFY THIS SECTION TO CHANGE WHAT GETS PATCHED
// ============================================================================

const patches: Patch[] = [
  // Replace "versions" with "versionz"
  {
    address: 0x3af00,
    type: "string",
    data: "versionz",
    description: 'Change "versions" to "versionz"',
  },
  {
    address: 0x3050c,
    type: "uint16le",
    data: 0x2303,
    description: "Load '3' as the initial mode, not '1'",
  },

  // // NOP out the "bl #update_setting" call at 0x3051c
  // // Original: fff76cfd (bl instruction)
  // // Replace with two Thumb NOPs: bf00 bf00
  // {
  //   address: 0x3051c,
  //   type: "uint32le",
  //   data: 0xbf00bf00,
  //   description: 'NOP out bl #update_setting at 0x3051c',
  // },

  // Example: Write a single byte
  // {
  //   address: 0x30000,
  //   type: 'uint8',
  //   data: 0x42,
  //   description: 'Write byte 0x42',
  // },

  // Example: Write a 32-bit value (little-endian)
  // {
  //   address: 0x30004,
  //   type: 'uint32le',
  //   data: 0xDEADBEEF,
  //   description: 'Write 0xDEADBEEF',
  // },

  // Example: Write arbitrary bytes
  // {
  //   address: 0x30008,
  //   type: 'bytes',
  //   data: Buffer.from([0x01, 0x02, 0x03, 0x04]),
  //   description: 'Write custom bytes',
  // },
];

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

    case "uint16le": {
      console.log(`    Writing: ${toHex(data & 0xffff)} (LE)`);
      flash.writeUInt16LE(data, address);
      break;
    }

    case "uint32le": {
      console.log(`    Writing: ${toHex(data)} (LE)`);
      flash.writeUInt32LE(data, address);
      break;
    }

    case "bytes": {
      console.log(`    Writing: ${data.length} bytes`);
      data.copy(flash, address);
      break;
    }

    default:
      throw new Error(`Unknown patch type: ${type}`);
  }
}

// ============================================================================
// MAIN LOGIC
// ============================================================================

function main(): void {
  // Parse arguments
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: tsx patch-firmware.ts <input.bin>");
    process.exit(1);
  }

  const inputPath = args[0];

  if (!inputPath || !fs.existsSync(inputPath)) {
    console.error(`Error: File not found: ${inputPath}`);
    process.exit(1);
  }

  const outputPath = inputPath.replace(/\.bin$/, "") + ".patched.bin";

  console.log("nRF52 Firmware Patcher");
  console.log("=====================\n");
  console.log(`Input:  ${inputPath}`);
  console.log(`Output: ${outputPath}\n`);

  // Read input file
  console.log("Step 1: Reading input file...");
  const flash = fs.readFileSync(inputPath);
  console.log(
    `  Size: ${flash.length} bytes (${(flash.length / 1024).toFixed(1)} KB)\n`,
  );

  // Read bootloader settings
  console.log("Step 2: Reading bootloader settings...");
  const blSettings = readBootloaderSettings(flash);

  console.log(`  Settings Version: ${blSettings.settingsVersion}`);
  console.log(`  App Version:      ${blSettings.appVersion}`);
  console.log(`  Bank 0:`);
  console.log(
    `    Image Size: ${blSettings.bank0.imageSize} bytes (${(blSettings.bank0.imageSize / 1024).toFixed(1)} KB)`,
  );
  console.log(`    Image CRC:  ${toHex(blSettings.bank0.imageCrc)}`);
  console.log(`    Bank Code:  ${toHex(blSettings.bank0.bankCode)}\n`);

  // Calculate original CRC
  console.log("Step 3: Calculating original app CRC...");
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
    console.log(`  ⚠ Warning: CRC mismatch!`);
    console.log(`    Expected: ${toHex(blSettings.bank0.imageCrc)}`);
    console.log(`    Got:      ${toHex(originalCrc)}`);
  } else {
    console.log(`  ✓ CRC matches bootloader settings\n`);
  }

  // Apply patches
  console.log("Step 4: Applying patches...");
  if (patches.length === 0) {
    console.log("  No patches defined.\n");
  } else {
    for (const patch of patches) {
      applyPatch(flash, patch);
    }
    console.log();
  }

  // Calculate new CRC
  console.log("Step 5: Calculating new app CRC...");
  const patchedAppData = flash.subarray(
    APP_START,
    APP_START + blSettings.bank0.imageSize,
  );
  const newCrc = crc32.buf(patchedAppData) >>> 0;

  console.log(`  New CRC: ${toHex(newCrc)}\n`);

  // Update Bank 0 Image CRC in bootloader settings
  console.log("Step 6: Updating bootloader settings...");
  const bank0CrcAddr = BL_SETTINGS_ADDR + BANK0_IMAGE_CRC_OFFSET;

  console.log(`  Bank 0 Image CRC address: ${toHex(bank0CrcAddr)}`);
  console.log(`  Old value: ${toHex(flash.readUInt32LE(bank0CrcAddr))}`);

  flash.writeUInt32LE(newCrc, bank0CrcAddr);

  console.log(`  New value: ${toHex(flash.readUInt32LE(bank0CrcAddr))}\n`);

  // Recalculate bootloader settings CRC
  console.log("Step 7: Recalculating bootloader settings CRC...");
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
  console.log(`  ✓ Updated\n`);

  // Write output file
  console.log("Step 8: Writing patched firmware...");
  fs.writeFileSync(outputPath, flash);
  console.log(`  ✓ Saved to: ${outputPath}\n`);

  // Summary
  console.log("Summary:");
  console.log("========");
  console.log(`  Patches applied:     ${patches.length}`);
  console.log(`  Original app CRC:    ${toHex(originalCrc)}`);
  console.log(`  Patched app CRC:     ${toHex(newCrc)}`);
  console.log(`  Settings CRC:        ${toHex(settingsCrc)}`);
  console.log(`\n✓✓✓ Patching complete! ✓✓✓\n`);
  console.log(`To flash the patched firmware:`);
  console.log(`  tsx main.ts erase`);
  console.log(
    `  tsx main.ts restore ${outputPath} ./patched_backup/metadata.json`,
  );
}

main();
