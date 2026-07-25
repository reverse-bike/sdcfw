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
import { buildPackage, type PackageBuild } from "@sdcfw/firmware-utils";
import { buildPatchedImage, toHex } from "./patcher";
import type { PatchFile } from "./patches/types";

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
  const publicKeyOutput = execSync(
    `nrfutil keys display --key pk --format code ${privateKeyPath}`,
    {
      encoding: "utf-8",
    },
  );

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
  const hexArray = Array.from(rawPublicKey).map((b) => "0x" + b.toString(16).padStart(2, "0"));

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
  console.log(
    `nrfutil pkg generate --hw-version 52 --sd-req 0xA5 --application app.hex --application-version 1 --key-file ${privateKeyPath} dfu_package.zip`,
  );

  console.log("\nKey generation complete!");
}

// ============================================================================
// PATCH COMMAND
// ============================================================================

interface PatchOptions {
  /** Directory to write the loose patched image into */
  binDir?: string;
  /** Directory to write the firmware archive into */
  zipDir?: string;
}

/**
 * Package the patch output as a firmware archive.
 *
 * The companion file ships unmodified alongside the image: the DFU init packet
 * for a controller, the UICR dump for a display. Display archives keep the
 * `flash.bin` / `uicr.bin` entry names the restore tool and every existing
 * backup rely on.
 */
async function writeArchive(
  patchFile: PatchFile,
  options: {
    projectRoot: string;
    zipDir: string;
    source: Buffer;
    sourceName: string;
    output: Buffer;
    outputName: string;
  },
): Promise<void> {
  /** Narrows per target: a display release declares nrfVersion, a controller one controllerVersion. */
  function requireRelease<T>(release: T | undefined): T {
    if (!release) {
      throw new Error(
        `${patchFile.name} has no release block, so it cannot be packaged. ` +
          `Add one to publish this descriptor as a firmware archive.`,
      );
    }
    return release;
  }

  const kind = patchFile.patches.length > 0 ? "patched" : "stock";
  const companionPath = path.resolve(
    options.projectRoot,
    patchFile.target === "controller" ? patchFile.datPath : patchFile.uicrPath,
  );
  if (!fs.existsSync(companionPath)) {
    throw new Error(`Companion file not found: ${companionPath}`);
  }
  const companion = fs.readFileSync(companionPath);
  // The repo-relative path, not a basename: for display releases the source is
  // also called flash.bin, and naming it twice with two hashes reads as a
  // contradiction to anyone checking the archive by hand.
  const source = { name: options.sourceName, data: new Uint8Array(options.source) };

  let build: PackageBuild;
  if (patchFile.target === "controller") {
    const release = requireRelease(patchFile.release);
    build = {
      target: "controller",
      version: release.version,
      kind,
      controllerVersion: release.controllerVersion,
      bin: { name: options.outputName, data: new Uint8Array(options.output) },
      dat: { name: path.basename(companionPath), data: new Uint8Array(companion) },
      source,
    };
  } else {
    const release = requireRelease(patchFile.release);
    build = {
      target: "nrf",
      version: release.version,
      kind,
      nrfVersion: release.nrfVersion,
      flash: { name: "flash.bin", data: new Uint8Array(options.output) },
      uicr: { name: "uicr.bin", data: new Uint8Array(companion) },
      source,
    };
  }
  const built = await buildPackage(build);

  fs.mkdirSync(options.zipDir, { recursive: true });
  const archivePath = path.join(options.zipDir, built.fileName);
  fs.writeFileSync(archivePath, built.zip);

  console.log(`\nArchive: ${archivePath}`);
  console.log(`  ${(built.zip.length / 1024).toFixed(1)} KB, release ${built.manifest.version}`);
  for (const [role, file] of Object.entries(built.manifest.files)) {
    console.log(`  ${role}: ${file.name} (${file.sha256})`);
  }

  console.log("\nContent entry stub:");
  console.log("---");
  console.log(`name: ${patchFile.name}`);
  console.log(`version: "${built.manifest.version}"`);
  console.log(`target: ${built.manifest.target}`);
  console.log(`path: /cfw/${built.fileName}`);
  console.log(`date: ${new Date().toISOString().slice(0, 10)}`);
  console.log("description: TODO");
  console.log("compatibility: TODO");
  console.log("---");
}

async function patch(patchFilePath: string, options: PatchOptions = {}): Promise<void> {
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
  console.log(`  Target: ${patchFile.target}`);
  console.log(`  Firmware: ${patchFile.firmwarePath}`);
  console.log(`  Patches: ${patchFile.patches.length}\n`);

  // Resolve firmware path relative to project root
  const currentDir = path.dirname(new URL(import.meta.url).pathname);
  const projectRoot = path.resolve(currentDir, "../..");
  const firmwarePath = path.resolve(projectRoot, patchFile.firmwarePath);

  if (!fs.existsSync(firmwarePath)) {
    console.error(`Error: Firmware file not found: ${firmwarePath}`);
    process.exit(1);
  }

  // Kitchen owns output naming: a patched image is marked as such, a stock
  // release keeps the original name and so never overwrites its own input.
  const firmwareDir = path.dirname(firmwarePath);
  const firmwareBasename = path.basename(firmwarePath, ".bin");
  const outputPostfix = patchFile.patches.length > 0 ? ".patched" : "";
  const outputName = `${firmwareBasename}${outputPostfix}.bin`;
  const binDir = options.binDir ? path.resolve(options.binDir) : firmwareDir;
  const outputPath = path.join(binDir, outputName);
  const writeBin = options.binDir !== undefined || options.zipDir === undefined;
  if (writeBin && outputPath === firmwarePath) {
    throw new Error(
      `Refusing to overwrite the pristine input image: ${firmwarePath}\n` +
        `  A descriptor with no patches reproduces its input, so it can only be ` +
        `written to a different output directory.`,
    );
  }

  console.log(`Input:  ${firmwarePath}`);
  console.log(`Output: ${writeBin ? outputPath : "(archive only)"}\n`);

  console.log("Step 2: Reading input file...");
  const sourceBytes = fs.readFileSync(firmwarePath);
  console.log(`  Size: ${sourceBytes.length} bytes (${(sourceBytes.length / 1024).toFixed(1)} KB)`);

  console.log("\nStep 3: Patching...");
  const { output, nrf } = buildPatchedImage(patchFile, sourceBytes, (message) =>
    console.log(`  ${message}`),
  );

  console.log("\nStep 4: Writing output...");
  const outputHasher = new Bun.CryptoHasher("sha256");
  outputHasher.update(output);
  console.log(`  SHA-256: ${outputHasher.digest("hex")}`);
  if (writeBin) {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(outputPath, output);
    console.log(`  Saved to: ${outputPath}`);
  }

  console.log("\nSummary:");
  console.log("========");
  console.log(`  Patches applied: ${patchFile.patches.length}`);
  if (nrf) {
    console.log(`  Original app CRC: ${toHex(nrf.originalCrc)}`);
    console.log(`  Patched app CRC:  ${toHex(nrf.newCrc)}`);
    console.log(`  Settings CRC:     ${toHex(nrf.settingsCrc)}`);
    console.log(`\nTo flash the patched firmware:`);
    console.log(`  bun apps/nrf-farm/main.ts erase`);
    console.log(`  bun apps/nrf-farm/main.ts restore ${outputPath} ./patched_backup/uicr.bin`);
  }

  if (options.zipDir) {
    await writeArchive(patchFile, {
      projectRoot,
      zipDir: options.zipDir,
      source: sourceBytes,
      sourceName: patchFile.firmwarePath,
      output,
      outputName,
    });
  }
}

// ============================================================================
// MAIN - COMMAND ROUTER
// ============================================================================

function showUsage(): void {
  console.log("Kitchen - Firmware Tools");
  console.log("========================\n");
  console.log("Commands:");
  console.log("  patch <patch-file.ts> [--bin <dir>] [--zip <dir>]");
  console.log("                         Apply patches to firmware");
  console.log("  keygen <output-dir>    Generate signing keys for nrfutil\n");
  console.log("Options:");
  console.log("  --bin <dir>  Write the loose patched image here");
  console.log("               (defaults to the source firmware directory)");
  console.log("  --zip <dir>  Write a firmware archive here; requires a release block.");
  console.log("               Without --bin, no loose image is written.\n");
  console.log("Examples:");
  console.log("  bun run main.ts patch ./patches/nrf-6-221122-0.ts");
  console.log("  bun run main.ts patch ./patches/mc-230-bluetooth-ext1-310.ts \\");
  console.log("    --zip apps/web/public/cfw");
  console.log("  bun run main.ts keygen ./keys");
}

function parsePatchOptions(args: string[]): PatchOptions {
  const options: PatchOptions = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag !== "--bin" && flag !== "--zip") {
      throw new Error(`Unknown option: ${flag}`);
    }
    const value = args[++index];
    if (!value || value.startsWith("-")) {
      throw new Error(`Missing directory for ${flag}`);
    }
    if (flag === "--bin") options.binDir = value;
    else options.zipDir = value;
  }
  return options;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  switch (command) {
    case "patch":
      if (!args[1]) {
        console.error("Error: Missing patch file argument");
        console.error("Usage: bun run main.ts patch <patch-file.ts> [--bin <dir>] [--zip <dir>]");
        process.exit(1);
      }
      await patch(args[1], parsePatchOptions(args.slice(2)));
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
