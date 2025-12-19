#!/usr/bin/env bun
import fs from "fs";
import path from "path";
import {
  findDevice,
  connectDAP,
  disconnectDAP,
  backup as backupOperation,
  erase as eraseOperation,
  restore as restoreOperation,
  readDeviceInfo,
  readUICR,
  readBootloaderSettings,
  createError,
  type DAPConnection,
  type CoreError,
} from "@sdcfw/core";

function printUsage() {
  console.log(`
nRF52 Tool - Backup, Erase, and Restore nRF52 devices via CMSIS-DAP

Usage:
  node main.ts read_info
    - Reads and displays device information (FICR and UICR)

  node main.ts backup <output-dir>
    - Backs up flash and UICR to files in output-dir
    - Creates: flash.bin and uicr.bin

  node main.ts erase
    - Performs chip erase (ERASEALL via CTRL-AP)
    - Removes APPROTECT and erases all flash and UICR

  node main.ts restore <flash.bin> <uicr.bin> [--no-verify]
    - Restores flash and UICR from backup files
    - Use --no-verify to skip verification (faster but risky)

  node main.ts dev
    - Development/experimental commands (use at your own risk)

Examples:
  node main.ts read_info
  node main.ts backup ./backup
  node main.ts erase
  node main.ts restore ./backup/flash.bin ./backup/uicr.bin
`);
}

function toHex(val: number): string {
  return "0x" + (val >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

function exitWithError(err: CoreError): never {
  console.error("\nError:", err.message);
  process.exit(1);
}

async function getConnection(): Promise<DAPConnection> {
  console.log("Connecting to device...");

  const deviceResult = await findDevice();
  if (!deviceResult.ok) {
    exitWithError(deviceResult.error);
  }

  const connResult = await connectDAP(deviceResult.value);
  if (!connResult.ok) {
    exitWithError(connResult.error);
  }

  return connResult.value;
}

async function runReadInfo() {
  const connection = await getConnection();

  try {
    console.log("Connected. Reading device information...\n");

    const deviceInfo = await readDeviceInfo(connection.dap);
    const uicr = await readUICR(connection.dap);

    // Format device info
    console.log("Device Information:");
    console.log("===================");

    // Part number
    const partStr = `nRF${deviceInfo.part.toString(16).toUpperCase()}`;
    console.log(`${"Part".padEnd(20)}: ${partStr} (${toHex(deviceInfo.part)})`);

    // Variant
    const variantBuf = Buffer.alloc(4);
    variantBuf.writeUInt32BE(deviceInfo.variant);
    // oxlint-disable-next-line eslint/no-control-regex
    const variantStr = variantBuf.toString("ascii").replace(/\0/g, "");
    console.log(
      `${"Variant".padEnd(20)}: ${variantStr} (${toHex(deviceInfo.variant)})`,
    );

    // Package
    const pkgMap: Record<number, string> = {
      0x2000: "QF (48-pin QFN)",
      0x2001: "CH (7x7 BGA)",
      0x2002: "CI (5x5 BGA)",
      0x2005: "QK",
    };
    const pkgStr = pkgMap[deviceInfo.package] || "Unknown";
    console.log(
      `${"Package".padEnd(20)}: ${pkgStr} (${toHex(deviceInfo.package)})`,
    );

    // RAM and Flash
    console.log(`${"RAM Size".padEnd(20)}: ${deviceInfo.ram} kB`);
    console.log(`${"Flash Size".padEnd(20)}: ${deviceInfo.flash} kB`);

    // Device ID
    const deviceIdStr =
      toHex(deviceInfo.deviceId[1]).substring(2) +
      toHex(deviceInfo.deviceId[0]).substring(2);
    console.log(`${"Device ID".padEnd(20)}: 0x${deviceIdStr}`);

    // MAC Address
    const addrStr =
      toHex(deviceInfo.deviceAddr[1]).substring(2) +
      toHex(deviceInfo.deviceAddr[0]).substring(2);
    const addrType =
      deviceInfo.deviceAddrType === 0xffffffff ? "Random Static" : "Public";
    console.log(`${"MAC Address".padEnd(20)}: ${addrStr} (Type: ${addrType})`);

    console.log("\nConfiguration:");
    console.log("--------------");

    // APPROTECT
    const approtectStr =
      (uicr.approtect & 0xff) === 0x00
        ? "Enabled (Protected)"
        : "Disabled (Unlocked)";
    console.log(
      `${"Readout Protection".padEnd(20)}: ${approtectStr} (${toHex(uicr.approtect)})`,
    );

    // Reset pins
    const pselreset0Str =
      uicr.pselreset0 & 0x80000000
        ? "Disconnected"
        : `Pin ${uicr.pselreset0 & 0xff}`;
    console.log(
      `${"Reset Pin 1".padEnd(20)}: ${pselreset0Str} (${toHex(uicr.pselreset0)})`,
    );

    const pselreset1Str =
      uicr.pselreset1 & 0x80000000
        ? "Disconnected"
        : `Pin ${uicr.pselreset1 & 0xff}`;
    console.log(
      `${"Reset Pin 2".padEnd(20)}: ${pselreset1Str} (${toHex(uicr.pselreset1)})`,
    );

    // NFC Pins
    const nfcpinsStr = (uicr.nfcpins & 0x01) === 0 ? "GPIO" : "NFC Antenna";
    console.log(
      `${"NFC Pins Mode".padEnd(20)}: ${nfcpinsStr} (${toHex(uicr.nfcpins)})`,
    );

    // Bootloader addresses
    const nrffw0Str =
      uicr.nrffw0 === 0xffffffff ? "Not Set" : toHex(uicr.nrffw0).substring(2);
    console.log(`${"Bootloader Addr".padEnd(20)}: ${nrffw0Str}`);

    const nrffw1Str =
      uicr.nrffw1 === 0xffffffff ? "Not Set" : toHex(uicr.nrffw1).substring(2);
    console.log(`${"NRFFW[1]".padEnd(20)}: ${nrffw1Str}`);

    console.log("\nFactory Info (Raw):");
    console.log("-------------------");
    console.log(
      `${"Page Size".padEnd(20)}: ${deviceInfo.codepagesize} bytes (${toHex(deviceInfo.codepagesize)})`,
    );
    const totalFlash = (deviceInfo.codesize * deviceInfo.codepagesize) / 1024;
    console.log(
      `${"Page Count".padEnd(20)}: ${deviceInfo.codesize} pages (${totalFlash} kB) (${toHex(deviceInfo.codesize)})`,
    );

    // Bootloader Settings
    console.log("\nBootloader Settings:");
    console.log("-------------------");

    const bootloaderSettings = await readBootloaderSettings(connection.dap);

    if (bootloaderSettings === null) {
      console.log("No bootloader settings found (memory erased or not set)");
    } else {
      console.log(`${"CRC".padEnd(20)}: ${toHex(bootloaderSettings.crc)}`);
      console.log(
        `${"Settings Version".padEnd(20)}: ${bootloaderSettings.settingsVersion}`,
      );
      console.log(
        `${"App Version".padEnd(20)}: ${bootloaderSettings.appVersion}`,
      );
      console.log(
        `${"Bootloader Version".padEnd(20)}: ${bootloaderSettings.bootloaderVersion}`,
      );
      console.log(
        `${"Bank Layout".padEnd(20)}: ${bootloaderSettings.bankLayout === 0 ? "Single" : "Dual"}`,
      );
      console.log(
        `${"Bank Current".padEnd(20)}: Bank ${bootloaderSettings.bankCurrent}`,
      );

      console.log("\n  Bank 0:");
      console.log(
        `  ${"Image Size".padEnd(18)}: ${bootloaderSettings.bank0.imageSize} bytes (${(bootloaderSettings.bank0.imageSize / 1024).toFixed(1)} kB)`,
      );
      console.log(
        `  ${"Image CRC".padEnd(18)}: ${toHex(bootloaderSettings.bank0.imageCrc)}`,
      );
      console.log(
        `  ${"Bank Code".padEnd(18)}: ${toHex(bootloaderSettings.bank0.bankCode)}`,
      );

      console.log("\n  Bank 1:");
      console.log(
        `  ${"Image Size".padEnd(18)}: ${bootloaderSettings.bank1.imageSize} bytes (${(bootloaderSettings.bank1.imageSize / 1024).toFixed(1)} kB)`,
      );
      console.log(
        `  ${"Image CRC".padEnd(18)}: ${toHex(bootloaderSettings.bank1.imageCrc)}`,
      );
      console.log(
        `  ${"Bank Code".padEnd(18)}: ${toHex(bootloaderSettings.bank1.bankCode)}`,
      );

      console.log();
      console.log(
        `${"Write Offset".padEnd(20)}: ${toHex(bootloaderSettings.writeOffset)}`,
      );
      console.log(
        `${"SD Size".padEnd(20)}: ${bootloaderSettings.sdSize} bytes (${(bootloaderSettings.sdSize / 1024).toFixed(1)} kB)`,
      );

      console.log("\n  DFU Progress:");
      console.log(
        `  ${"Command Size".padEnd(18)}: ${bootloaderSettings.progress.commandSize} bytes`,
      );
      console.log(
        `  ${"Command Offset".padEnd(18)}: ${bootloaderSettings.progress.commandOffset}`,
      );
      console.log(
        `  ${"Command CRC".padEnd(18)}: ${toHex(bootloaderSettings.progress.commandCrc)}`,
      );
      console.log(
        `  ${"Data Object Size".padEnd(18)}: ${bootloaderSettings.progress.dataObjectSize} bytes`,
      );
      console.log(
        `  ${"FW Image CRC".padEnd(18)}: ${toHex(bootloaderSettings.progress.firmwareImageCrc)}`,
      );
      console.log(
        `  ${"FW Image CRC Last".padEnd(18)}: ${toHex(bootloaderSettings.progress.firmwareImageCrcLast)}`,
      );
      console.log(
        `  ${"FW Image Offset".padEnd(18)}: ${toHex(bootloaderSettings.progress.firmwareImageOffset)}`,
      );
      console.log(
        `  ${"FW Image Offs Last".padEnd(18)}: ${toHex(bootloaderSettings.progress.firmwareImageOffsetLast)}`,
      );

      console.log();
      console.log(
        `${"Enter Buttonless".padEnd(20)}: ${bootloaderSettings.enterButtonlessDfu === 1 ? "Yes" : "No"} (${toHex(bootloaderSettings.enterButtonlessDfu)})`,
      );
    }
  } finally {
    await disconnectDAP(connection);
  }
}

async function runBackup(outputDir: string) {
  console.log("Starting backup...");

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const connection = await getConnection();

  try {
    const result = await backupOperation(connection, (message) => {
      console.log(message);
    });

    if (!result.ok) {
      exitWithError(result.error);
    }

    // Save flash data
    const flashPath = path.join(outputDir, "flash.bin");
    fs.writeFileSync(flashPath, result.value.flashData);
    console.log(`Flash data saved to: ${flashPath}`);

    // Save UICR data
    const uicrPath = path.join(outputDir, "uicr.bin");
    fs.writeFileSync(uicrPath, result.value.uicrData);
    console.log(`UICR data saved to: ${uicrPath}`);

    console.log("\nBackup Summary:");
    console.log("================");
    console.log(`Flash Size: ${result.value.flashData.length / 1024} KB`);
    console.log(`UICR Size: ${result.value.uicrData.length} bytes`);
  } finally {
    await disconnectDAP(connection);
  }
}

async function runErase() {
  console.log("Starting chip erase...");
  console.log(
    "WARNING: This will erase ALL data and remove APPROTECT protection!",
  );

  const connection = await getConnection();

  try {
    const result = await eraseOperation(connection, (message) => {
      console.log(message);
    });

    if (!result.ok) {
      exitWithError(result.error);
    }

    console.log("\nErase complete!");
  } finally {
    await disconnectDAP(connection);
  }
}

async function runRestore(
  flashFile: string,
  uicrFile: string,
  options: { verify: boolean },
) {
  console.log("Starting restore...");

  // Check files exist
  if (!fs.existsSync(flashFile)) {
    exitWithError(createError("INVALID_DATA", `Flash file not found: ${flashFile}`));
  }
  if (!fs.existsSync(uicrFile)) {
    exitWithError(createError("INVALID_DATA", `UICR file not found: ${uicrFile}`));
  }

  // Load files
  const flashData = fs.readFileSync(flashFile);
  const uicrData = fs.readFileSync(uicrFile);

  console.log(`Loaded flash data: ${flashData.length} bytes`);
  console.log(`Loaded UICR data: ${uicrData.length} bytes`);

  const connection = await getConnection();

  try {
    const result = await restoreOperation(
      connection,
      flashData,
      uicrData,
      {
        verify: options.verify,
      },
      (message) => {
        console.log(message);
      },
    );

    if (!result.ok) {
      exitWithError(result.error);
    }

    console.log("\nRestore complete!");
  } finally {
    await disconnectDAP(connection);
  }
}

async function runDev() {
  console.log("Starting dev experiment...");
  console.log("nothing here");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    printUsage();
    process.exit(1);
  }

  const command = args[0];

  switch (command) {
    case "read_info": {
      await runReadInfo();
      break;
    }

    case "backup": {
      if (args.length < 2) {
        console.error("Error: Missing output directory");
        printUsage();
        process.exit(1);
      }
      await runBackup(args[1]!);
      break;
    }

    case "erase": {
      await runErase();
      break;
    }

    case "restore": {
      if (args.length < 3) {
        console.error("Error: Missing flash.bin or uicr.bin");
        printUsage();
        process.exit(1);
      }

      const flashFile = args[1];
      const uicrFile = args[2];
      const verify = !args.includes("--no-verify");

      await runRestore(flashFile!, uicrFile!, { verify });
      break;
    }

    case "dev": {
      await runDev();
      break;
    }

    default: {
      console.error(`Error: Unknown command '${command}'`);
      printUsage();
      process.exit(1);
    }
  }
}

main();
