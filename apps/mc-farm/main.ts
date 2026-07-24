#!/usr/bin/env bun

import * as readline from "node:readline";
import {
  armControllerUpdate,
  connect,
  hex,
  parseDfuPackage,
  readVersionInfo,
  serialFromManufacturerData,
  sleep,
  transferControllerFirmware,
  withDeadline,
  type ModuleVersionInfo,
} from "@sdcfw/ble-utils";
import { findAdvertisedDevice, type ScannedDevice } from "./node-ble.js";

interface ParsedArguments {
  positional: string[];
  flags: Map<string, string>;
}

const BOOLEAN_FLAGS = new Set(["--execute", "--yes", "-y", "--help", "-h"]);

function parseArguments(argv: string[]): ParsedArguments {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index]!;
    if (!value.startsWith("-")) {
      positional.push(value);
      continue;
    }
    if (BOOLEAN_FLAGS.has(value)) {
      flags.set(value, "1");
      continue;
    }
    const argument = argv[++index];
    if (!argument || argument.startsWith("-")) {
      throw new Error(`missing value for ${value}`);
    }
    flags.set(value, argument);
  }
  return { positional, flags };
}

function showUsage(): void {
  console.log(`
mc-farm - Motor-controller firmware tools over BLE

Usage:
  mc-farm read-info <advertised-name>
  mc-farm flash <advertised-name> --bin <firmware.bin> --dat <init.dat> [--execute]

Flash is a dry run unless --execute is supplied. A dry run connects to the
bike, enters DFU mode, and submits the .dat init packet, but sends no firmware
data.

Options:
  --execute             Send and execute the firmware binary
  --yes, -y             Skip the interactive confirmation
  --dfu-name <name>     DFU advertised name (default: DfuTarg)
  --scan-time <seconds> BLE scan timeout (default: 60)
  --timeout <seconds>   Overall timeout (default: 900)
  --wait <seconds>      Wait after arming external flash (default: 8)
  --chunk <bytes>       Initial BLE packet size (default: 20)
  --object-size <bytes> DFU object size (default: 4096)
  --prn <count>         Packet receipt interval (default: 0)
`);
}

function numberFlag(
  flags: Map<string, string>,
  name: string,
  fallback: number,
): number {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

async function confirm(approved: boolean, message: string): Promise<void> {
  if (approved) return;
  const input = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const answer = await new Promise<string>((resolve) => {
    input.question(`\n${message}\nType "yes" to continue: `, resolve);
  });
  input.close();
  if (answer.trim().toLowerCase() !== "yes") {
    throw new Error("aborted");
  }
}

function printVersionInfo(info: ModuleVersionInfo): void {
  console.log("\nDisplay main controller / nRF");
  if (info.model) console.log(`  Model: ${info.model}`);
  if (info.serialNumber) console.log(`  Serial Number: ${info.serialNumber}`);
  if (info.manufacturerName)
    console.log(`  Manufacturer: ${info.manufacturerName}`);
  if (info.hardwareRevision)
    console.log(`  Hardware Revision: ${info.hardwareRevision}`);
  if (info.nrfVersion) console.log(`  nRF Version: ${info.nrfVersion}`);
  if (info.softwareRevision)
    console.log(`  Software Revision: ${info.softwareRevision}`);
  console.log(`  nRF Bootloader Version: ${info.nrfBootloaderVersion}`);
  console.log(`  Firmware Variant: ${info.firmwareVariant}`);

  console.log("\nDisplay CAN bridge / STM");
  console.log(`  Firmware Version: ${info.stmVersion}`);

  console.log("\nMotor controller");
  console.log(`  Firmware Version: ${info.controllerVersion}`);
  console.log(
    `  Controller Variant: ${info.controllerVariant || "unknown (0)"}`,
  );

  console.log("\nBattery management system");
  console.log(`  Firmware Version: ${info.batteryVersion}`);

  const additional = Object.entries(info.additionalDeviceInfo);
  if (additional.length > 0) {
    console.log("\nAdditional BLE device information");
    for (const [label, value] of additional) {
      console.log(`  ${label}: ${hex(value)}`);
    }
  }
}

function manufacturerData(device: ScannedDevice): Map<number, DataView> | undefined {
  return device._adData?.manufacturerData;
}

async function readInfo(advertisedName: string, scanTime: number): Promise<void> {
  console.log(`scanning for "${advertisedName}"`);
  const device = await findAdvertisedDevice(advertisedName, {
    scanTimeSeconds: scanTime,
    log: console.log,
  });
  console.log(`found ${device.name ?? "(unnamed)"} [${device.id}]; connecting`);
  const server = await connect(device, { log: console.log });
  try {
    const info = await readVersionInfo(server, {
      advertisedSerial: serialFromManufacturerData(manufacturerData(device)),
    });
    printVersionInfo(info);
  } finally {
    server.disconnect();
  }
}

async function flash(
  advertisedName: string,
  binPath: string,
  datPath: string,
  flags: Map<string, string>,
): Promise<void> {
  const execute = flags.has("--execute");
  const bin = new Uint8Array(await Bun.file(binPath).arrayBuffer());
  const dat = new Uint8Array(await Bun.file(datPath).arrayBuffer());
  if (bin.length === 0) throw new Error(`firmware binary is empty: ${binPath}`);
  if (dat.length === 0) throw new Error(`init packet is empty: ${datPath}`);

  const pkg = await parseDfuPackage(dat, bin);
  if (pkg.appSize !== bin.length) {
    throw new Error(
      `.dat app_size ${pkg.appSize} does not match .bin size ${bin.length}`,
    );
  }
  if (pkg.fwVersion !== 0x80) {
    throw new Error(
      `.dat firmware class is 0x${pkg.fwVersion.toString(16)}, expected EXT1 class 0x80`,
    );
  }

  console.log(`binary: ${binPath} (${bin.length} bytes)`);
  console.log(`init:   ${datPath} (${dat.length} bytes)`);
  console.log(
    `init payload hash: ${pkg.hashMatches ? "matches binary" : "does not match binary (expected for patched controller firmware)"}`,
  );
  console.log(`mode: ${execute ? "EXECUTE" : "DRY RUN"}`);

  await confirm(
    flags.has("--yes") || flags.has("-y"),
    execute
      ? `This will write motor-controller firmware to "${advertisedName}".`
      : `This dry run will reboot "${advertisedName}" into DFU mode and submit the init packet. It will send no firmware data.`,
  );

  const scanTime = numberFlag(flags, "--scan-time", 60);
  const dfuName = flags.get("--dfu-name") ?? "DfuTarg";
  console.log(`scanning for "${advertisedName}"`);
  const device = await findAdvertisedDevice(advertisedName, {
    scanTimeSeconds: scanTime,
    log: console.log,
  });
  console.log(`found ${device.name ?? "(unnamed)"} [${device.id}]; connecting`);
  const appServer = await connect(device, { log: console.log });
  try {
    await armControllerUpdate(appServer, bin, {
      eraseWaitMs: numberFlag(flags, "--wait", 8) * 1_000,
      log: console.log,
    });
  } finally {
    try {
      appServer.disconnect();
    } catch {
      // The expected reboot may have already disconnected.
    }
  }

  console.log(`waiting for "${dfuName}"`);
  await sleep(5_000);
  const dfuDevice = await findAdvertisedDevice(dfuName, {
    scanTimeSeconds: Math.max(scanTime, 120),
    log: console.log,
  });
  console.log(
    `found ${dfuDevice.name ?? "(unnamed)"} [${dfuDevice.id}]; connecting`,
  );
  const dfuServer = await connect(dfuDevice, { log: console.log });
  try {
    const result = await transferControllerFirmware(dfuServer, dat, bin, {
      executeFirmware: execute,
      chunkSize: numberFlag(flags, "--chunk", 20),
      objectSize: numberFlag(flags, "--object-size", 4_096),
      prn: numberFlag(flags, "--prn", 0),
      log: console.log,
    });
    if (!result.firmwareTransferred) {
      console.log(
        "\nDry run succeeded. No firmware data was sent. Power-cycle the bike to leave this test session.",
      );
    }
  } finally {
    try {
      dfuServer.disconnect();
    } catch {
      // Final execute normally reboots and drops the connection.
    }
  }
}

async function main(): Promise<void> {
  const { positional, flags } = parseArguments(process.argv.slice(2));
  const command = positional[0];
  if (!command || flags.has("--help") || flags.has("-h")) {
    showUsage();
    return;
  }

  const advertisedName = positional[1];
  if (!advertisedName) {
    throw new Error(`${command} requires an advertised BLE name`);
  }

  const timeout = numberFlag(flags, "--timeout", 900) * 1_000;
  switch (command) {
    case "read-info":
      await withDeadline(
        readInfo(
          advertisedName,
          numberFlag(flags, "--scan-time", 60),
        ),
        timeout,
        "read-info",
      );
      break;
    case "flash": {
      const binPath = flags.get("--bin");
      const datPath = flags.get("--dat");
      if (!binPath || !datPath) {
        throw new Error("flash requires both --bin and --dat");
      }
      await withDeadline(
        flash(advertisedName, binPath, datPath, flags),
        timeout,
        "flash",
      );
      break;
    }
    default:
      throw new Error(`unknown command: ${command}`);
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
