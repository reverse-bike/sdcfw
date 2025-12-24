#!/usr/bin/env bun
/**
 * Kitchen - nRF52 Firmware Tools
 *
 * Commands:
 *   patch <patch-file.ts>  - Apply patches to firmware
 *   keygen <output-dir>    - Generate signing keys for nrfutil
 *
 * Usage:
 *   bun run main.ts patch ./patches/nrf-6-221122-0.ts
 *   bun run main.ts keygen ./keys
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import crc32 from "crc-32";
import type {
  CleanRegion,
  Patch,
  PatchFile,
  PatchFindReplace,
} from "./patches/types";

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
 * For find-replace patches, also returns the found address.
 */
function verifyOriginal(
  flash: Buffer,
  patch: Patch,
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

    return { error: null, foundAddress: offsets[0] };
  }

  const { address } = patch;

  switch (type) {
    case "string": {
      const buf = Buffer.from(patch.original, "ascii");
      const actual = flash.subarray(address, address + buf.length);
      if (!actual.equals(buf)) {
        return {
          error: `Expected "${patch.original}" but found "${actual.toString("ascii")}"`,
        };
      }
      break;
    }

    case "uint8": {
      const actual = flash.readUInt8(address);
      if (actual !== patch.original) {
        return {
          error: `Expected 0x${patch.original.toString(16).padStart(2, "0")} but found 0x${actual.toString(16).padStart(2, "0")}`,
        };
      }
      break;
    }

    case "uint16": {
      const actual = flash.readUInt16BE(address);
      if (actual !== patch.original) {
        return {
          error: `Expected 0x${patch.original.toString(16).padStart(4, "0")} but found 0x${actual.toString(16).padStart(4, "0")}`,
        };
      }
      break;
    }

    case "uint32": {
      const actual = flash.readUInt32BE(address);
      if (actual !== patch.original) {
        return {
          error: `Expected ${toHex(patch.original)} but found ${toHex(actual)}`,
        };
      }
      break;
    }

    case "bytes": {
      const original = Buffer.from(patch.original);
      const actual = flash.subarray(address, address + original.length);
      if (!actual.equals(original)) {
        return {
          error: `Expected [${patch.original.map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")}] but found [${Array.from(actual).map((b) => "0x" + b.toString(16).padStart(2, "0")).join(", ")}]`,
        };
      }
      break;
    }
  }

  return { error: null };
}

function applyPatch(
  flash: Buffer,
  patch: Patch,
  foundAddress?: number,
): void {
  console.log(`  Applying: ${patch.description}`);

  switch (patch.type) {
    case "find-replace": {
      if (foundAddress === undefined) {
        throw new Error("find-replace patch requires foundAddress from verification");
      }
      console.log(`    Found at: ${toHex(foundAddress)}`);
      const buf = Buffer.from(patch.replace);
      console.log(`    Writing: ${buf.length} bytes`);
      buf.copy(flash, foundAddress);
      break;
    }

    case "string": {
      console.log(`    Address: ${toHex(patch.address)}`);
      const buf = Buffer.from(patch.data, "ascii");
      console.log(`    Writing: "${patch.data}" (${buf.length} bytes)`);
      buf.copy(flash, patch.address);
      break;
    }

    case "uint8": {
      console.log(`    Address: ${toHex(patch.address)}`);
      console.log(`    Writing: 0x${patch.data.toString(16).padStart(2, "0")}`);
      flash.writeUInt8(patch.data, patch.address);
      break;
    }

    case "uint16": {
      console.log(`    Address: ${toHex(patch.address)}`);
      console.log(
        `    Writing: 0x${(patch.data & 0xffff).toString(16).padStart(4, "0")}`,
      );
      flash.writeUInt16BE(patch.data, patch.address);
      break;
    }

    case "uint32": {
      console.log(`    Address: ${toHex(patch.address)}`);
      console.log(`    Writing: ${toHex(patch.data)}`);
      flash.writeUInt32BE(patch.data, patch.address);
      break;
    }

    case "bytes": {
      console.log(`    Address: ${toHex(patch.address)}`);
      const buf = Buffer.from(patch.data);
      console.log(`    Writing: ${buf.length} bytes`);
      buf.copy(flash, patch.address);
      break;
    }

    default:
      throw new Error(`Unknown patch type: ${(patch as Patch).type}`);
  }
}

// ============================================================================
// KEYGEN COMMAND
// ============================================================================

async function keygen(outputDir: string): Promise<void> {
  console.log("Kitchen - Key Generator");
  console.log("=======================\n");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const privateKeyPath = path.join(outputDir, "private.pem");

  // Generate key using nrfutil
  console.log("Generating secp256k1 key pair using nrfutil...\n");
  try {
    execSync(`nrfutil keys generate ${privateKeyPath}`, { stdio: "inherit" });
  } catch {
    console.error("Error: Failed to generate keys. Make sure nrfutil is installed.");
    console.error("Install with: pip install nrfutil");
    process.exit(1);
  }

  console.log(`\nPrivate key (PEM): ${privateKeyPath}`);

  // Extract public key using nrfutil
  console.log("\nExtracting public key...");
  const publicKeyOutput = execSync(`nrfutil keys display --key pk --format code ${privateKeyPath}`, {
    encoding: "utf-8",
  });

  // Parse the public key from nrfutil output
  // nrfutil outputs: "const uint8_t pk[64] =\n{\n    0x5f, 0x5a, ...\n};"
  const pkMatch = publicKeyOutput.match(/pk\[\d+\]\s*=\s*\{([^}]+)\}/s);
  if (!pkMatch) {
    console.error("Error: Could not parse public key from nrfutil output");
    console.error("Output was:", publicKeyOutput);
    process.exit(1);
  }

  // Parse the hex bytes
  const hexBytes = pkMatch[1]!
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("0x"))
    .map((s) => parseInt(s, 16));

  const rawPublicKey = Buffer.from(hexBytes);

  // Write public key in hex format
  const publicKeyHex = rawPublicKey.toString("hex");
  const publicKeyHexPath = path.join(outputDir, "public.hex");
  fs.writeFileSync(publicKeyHexPath, publicKeyHex);
  console.log(`Public key (hex):  ${publicKeyHexPath}`);

  // Generate the array format for patching
  const hexArray = Array.from(rawPublicKey).map(
    (b) => "0x" + b.toString(16).padStart(2, "0"),
  );

  // Format as 8 bytes per line for readability
  const lines: string[] = [];
  for (let i = 0; i < hexArray.length; i += 8) {
    lines.push(hexArray.slice(i, i + 8).join(", "));
  }

  const patchSnippet = `// Public key for firmware patching (${rawPublicKey.length} bytes)
// Generated: ${new Date().toISOString()}
export const publicKeyBytes = [
  ${lines.join(",\n  ")},
];`;

  const patchSnippetPath = path.join(outputDir, "public-key-patch.ts");
  fs.writeFileSync(patchSnippetPath, patchSnippet);
  console.log(`Patch snippet:     ${patchSnippetPath}`);

  console.log("\n--- Public Key (hex) ---");
  console.log(publicKeyHex);

  console.log("\n--- Patch Array Format ---");
  console.log(`[${hexArray.join(", ")}]`);

  console.log("\n--- Usage with nrfutil ---");
  console.log(`nrfutil pkg generate --hw-version 52 --sd-req 0xA5 --application app.hex --application-version 1 --key-file ${privateKeyPath} dfu_package.zip`);

  console.log("\nKey generation complete!");
}

// ============================================================================
// PATCH COMMAND
// ============================================================================

async function patch(patchFilePath: string): Promise<void> {
  if (!fs.existsSync(patchFilePath)) {
    console.error(`Error: Patch file not found: ${patchFilePath}`);
    process.exit(1);
  }

  // Load patch file
  console.log("Kitchen - Firmware Patcher");
  console.log("==========================\n");

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
  const foundAddresses: Map<Patch, number> = new Map();

  for (const patch of patchFile.patches) {
    const result = verifyOriginal(flash, patch);
    if (result.error) {
      console.log(`  FAIL: ${patch.description}`);
      if (patch.type === "find-replace") {
        console.log(`    ${result.error}`);
      } else {
        console.log(`    At ${toHex(patch.address)}: ${result.error}`);
      }
      verificationFailed = true;
    } else {
      if (result.foundAddress !== undefined) {
        foundAddresses.set(patch, result.foundAddress);
        console.log(`  OK: ${patch.description} (found at ${toHex(result.foundAddress)})`);
      } else {
        console.log(`  OK: ${patch.description}`);
      }
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
      applyPatch(flash, patch, foundAddresses.get(patch));
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

// ============================================================================
// MAIN - COMMAND ROUTER
// ============================================================================

function showUsage(): void {
  console.log("Kitchen - nRF52 Firmware Tools");
  console.log("==============================\n");
  console.log("Commands:");
  console.log("  patch <patch-file.ts>  Apply patches to firmware");
  console.log("  keygen <output-dir>    Generate signing keys for nrfutil\n");
  console.log("Examples:");
  console.log("  bun run main.ts patch ./patches/nrf-6-221122-0.ts");
  console.log("  bun run main.ts keygen ./keys");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "patch":
      if (!args[1]) {
        console.error("Error: Missing patch file argument");
        console.error("Usage: bun run main.ts patch <patch-file.ts>");
        process.exit(1);
      }
      await patch(args[1]);
      break;

    case "keygen":
      if (!args[1]) {
        console.error("Error: Missing output directory argument");
        console.error("Usage: bun run main.ts keygen <output-dir>");
        process.exit(1);
      }
      await keygen(args[1]);
      break;

    default:
      showUsage();
      if (command) {
        console.error(`\nError: Unknown command '${command}'`);
      }
      process.exit(command ? 1 : 0);
  }
}

main();
