#!/usr/bin/env bun

import * as readline from "node:readline";
import {
  APP_MANUFACTURER_ID,
  DFU_SERVICE,
  armControllerUpdate,
  connect,
  enterDfuMode,
  hex,
  parseDfuPackage,
  readStandardDeviceInformation,
  readVersionInfo,
  serialFromManufacturerData,
  sleep,
  transferControllerFirmware,
  validateDfuTransportOptions,
  withDeadline,
  type DfuTransportOptions,
  type ModuleVersionInfo,
  type StandardDeviceInformation,
} from "@sdcfw/ble-utils";
import { readControllerArchive, type ControllerFirmware } from "./firmware.js";
import { scanManufacturerDevices, scanServiceDevices, type ScannedDevice } from "./node-ble.js";

interface ParsedArguments {
  positional: string[];
  flags: Map<string, string>;
}

class CliUsageError extends Error {}

const BOOLEAN_FLAGS = new Set(["--arm", "--execute", "--yes", "-y", "--help", "-h"]);

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
      throw new CliUsageError(`missing value for ${value}`);
    }
    flags.set(value, argument);
  }
  return { positional, flags };
}

function showUsage(): void {
  console.log(`
mc-farm - Motor-controller firmware tools over BLE

Usage:
  mc-farm read [device-id]
  mc-farm read-dfu [device-id] [--arm]
  mc-farm flash [device-id] --zip <firmware.zip> [--execute]
  mc-farm flash [device-id] --bin <firmware.bin> --dat <init.dat> [--execute]

Flash is a dry run unless --execute is supplied. A dry run connects to the
bike, enters DFU mode, and submits the .dat init packet, but sends no firmware
data.

Options:
  --arm                 Enter DFU mode before read-dfu
  --zip <firmware.zip>  Read the binary and init packet from a Kitchen archive
  --execute             Send and execute the firmware binary
  --yes, -y             Skip confirmation before a write or DFU reboot
  --scan-time <seconds> BLE discovery window (default: 10)
  --timeout <seconds>   Overall timeout (default: 900)
  --wait <seconds>      Wait after arming external flash (default: 8)
  --chunk <bytes>       Initial BLE packet size (default: 20)
  --object-size <bytes> DFU object size (default: 4096)
  --prn <count>         Packet receipt interval (default: 0)

Examples:
  mc-farm read
  mc-farm read <device-id>
  mc-farm read-dfu
  mc-farm read-dfu --arm
  mc-farm read-dfu <device-id>
  mc-farm flash --zip mc-311-patched-v1.0.0.zip
  mc-farm flash --bin controller.patched.bin --dat controller.dat
  mc-farm flash <device-id> --zip mc-311-patched-v1.0.0.zip --execute
`);
}

function numberFlag(flags: Map<string, string>, name: string, fallback: number): number {
  const raw = flags.get(name);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new CliUsageError(`${name} must be a non-negative number`);
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
  if (info.manufacturerName) console.log(`  Manufacturer: ${info.manufacturerName}`);
  if (info.hardwareRevision) console.log(`  Hardware Revision: ${info.hardwareRevision}`);
  if (info.nrfVersion) console.log(`  nRF Version: ${info.nrfVersion}`);
  if (info.softwareRevision) console.log(`  Software Revision: ${info.softwareRevision}`);
  console.log(`  nRF Bootloader Version: ${info.nrfBootloaderVersion}`);
  console.log(`  Firmware Variant: ${info.firmwareVariant}`);

  console.log("\nDisplay CAN bridge / STM");
  console.log(`  Firmware Version: ${info.stmVersion}`);

  console.log("\nMotor controller");
  console.log(`  Firmware Version: ${info.controllerVersion}`);
  console.log(`  Controller Variant: ${info.controllerVariant || "unknown (0)"}`);

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

function printStandardDeviceInformation(info: StandardDeviceInformation[]): void {
  console.log("\nStandard BLE Device Information");
  if (info.length === 0) {
    console.log("  No readable characteristics found.");
    return;
  }
  for (const entry of info) {
    console.log(`  ${entry.label} [${entry.uuid}]: ${entry.text ?? hex(entry.value)}`);
  }
}

function manufacturerData(device: ScannedDevice): Map<number, DataView> | undefined {
  const advertised = device._adData?.manufacturerData;
  if (!advertised) return undefined;
  return new Map(Array.from(advertised, ([id, value]) => [Number(id), value]));
}

function describeDevice(device: BluetoothDevice): string {
  return `${device.name ?? "(unnamed)"} [${device.id}]`;
}

function printDeviceChoices(devices: ScannedDevice[]): void {
  for (const device of devices) {
    console.error(`  Name: ${device.name ?? "(unnamed)"}`);
    console.error(`  Device ID: ${device.id}`);
  }
}

function selectDevice(
  devices: ScannedDevice[],
  requestedId: string | undefined,
  description: string,
  selectionHint: string,
): ScannedDevice {
  if (requestedId !== undefined) {
    const wanted = requestedId.toLowerCase();
    const selected = devices.find((device) => String(device.id).toLowerCase() === wanted);
    if (selected) return selected;
    if (devices.length === 0) throw new Error(`no ${description} found`);
    console.error(`available ${description}:`);
    printDeviceChoices(devices);
    throw new Error(`device ID "${requestedId}" did not match; ${selectionHint}`);
  }
  if (devices.length === 0) throw new Error(`no ${description} found`);
  if (devices.length === 1) return devices[0]!;

  console.error(`multiple ${description} found:`);
  printDeviceChoices(devices);
  throw new Error(selectionHint);
}

async function readInfo(requestedId: string | undefined, scanTime: number): Promise<void> {
  console.log(
    `scanning ${scanTime}s for manufacturer 0x${APP_MANUFACTURER_ID.toString(16).padStart(4, "0")}`,
  );
  const discovered = await scanManufacturerDevices(APP_MANUFACTURER_ID, {
    scanTimeSeconds: scanTime,
  });
  if (discovered.length === 0) throw new Error("no compatible bikes found");
  const devices =
    requestedId === undefined
      ? discovered
      : [
          selectDevice(
            discovered,
            requestedId,
            "compatible bikes",
            "rerun with a Device ID shown by: mc-farm read",
          ),
        ];

  console.log(`found ${devices.length} compatible bike${devices.length === 1 ? "" : "s"}`);
  let successes = 0;
  for (const device of devices) {
    console.log(`\nBLE device\n  Name: ${device.name ?? "(unnamed)"}\n  Device ID: ${device.id}`);
    console.log("connecting");
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      server = await connect(device, { log: console.log });
      const advertisedSerial = serialFromManufacturerData(manufacturerData(device));
      const options = advertisedSerial === undefined ? {} : { advertisedSerial };
      printVersionInfo(await readVersionInfo(server, options));
      successes++;
    } catch (error) {
      console.error(`  Read failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      server?.disconnect();
    }
  }
  if (successes === 0) throw new Error("could not read any compatible bikes");
}

async function readDfuInfo(
  requestedId: string | undefined,
  arm: boolean,
  scanTime: number,
  approved: boolean,
): Promise<void> {
  if (arm) {
    console.log(
      `scanning ${scanTime}s for manufacturer 0x${APP_MANUFACTURER_ID.toString(16).padStart(4, "0")}`,
    );
    const appDevices = await scanManufacturerDevices(APP_MANUFACTURER_ID, {
      scanTimeSeconds: scanTime,
    });
    const device = selectDevice(
      appDevices,
      requestedId,
      "compatible bikes",
      "rerun with the intended Device ID: mc-farm read-dfu <device-id> --arm",
    );
    await confirm(
      approved,
      `This will reboot ${describeDevice(device)} into DFU mode. No firmware data will be sent. Power-cycle the bike afterward to leave DFU mode.`,
    );

    console.log(`selected ${describeDevice(device)}; connecting`);
    const appServer = await connect(device, { log: console.log });
    try {
      await enterDfuMode(appServer, { log: console.log });
    } finally {
      try {
        appServer.disconnect();
      } catch {
        // The expected reboot may have already disconnected.
      }
    }

    console.log(`waiting for Nordic DFU service (${DFU_SERVICE})`);
    await sleep(5_000);
  }

  console.log(`scanning ${scanTime}s for Nordic DFU service (${DFU_SERVICE})`);
  const dfuDevices = await scanServiceDevices(DFU_SERVICE, {
    scanTimeSeconds: scanTime,
  });
  const dfuDevice = selectDevice(
    dfuDevices,
    arm ? undefined : requestedId,
    "Nordic DFU targets",
    "rerun with the intended Device ID: mc-farm read-dfu <device-id>",
  );
  console.log(`selected ${describeDevice(dfuDevice)}; connecting`);
  const dfuServer = await connect(dfuDevice, { log: console.log });
  try {
    console.log(`\nDFU target: ${dfuDevice.name ?? "(unnamed)"} [${dfuDevice.id}]`);
    try {
      printStandardDeviceInformation(await readStandardDeviceInformation(dfuServer));
    } catch (error) {
      console.log(
        `\nStandard BLE Device Information\n  Device Information Service unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    console.log("\nNo firmware data was sent. Power-cycle the bike to leave DFU mode.");
  } finally {
    dfuServer.disconnect();
  }
}

async function flash(
  requestedId: string | undefined,
  firmware: ControllerFirmware,
  flags: Map<string, string>,
): Promise<void> {
  const execute = flags.has("--execute");
  let transport: DfuTransportOptions;
  try {
    transport = validateDfuTransportOptions({
      chunkSize: numberFlag(flags, "--chunk", 20),
      objectSize: numberFlag(flags, "--object-size", 4_096),
      prn: numberFlag(flags, "--prn", 0),
    });
  } catch (error) {
    throw new CliUsageError(error instanceof Error ? error.message : String(error));
  }
  const { bin, dat } = firmware;
  if (bin.length === 0) throw new Error(`firmware binary is empty: ${firmware.binLabel}`);
  if (dat.length === 0) throw new Error(`init packet is empty: ${firmware.datLabel}`);

  const pkg = await parseDfuPackage(dat, bin);
  if (pkg.appSize !== bin.length) {
    throw new Error(`.dat app_size ${pkg.appSize} does not match .bin size ${bin.length}`);
  }
  if (pkg.fwVersion !== 0x80) {
    throw new Error(
      `.dat firmware class is 0x${pkg.fwVersion.toString(16)}, expected EXT1 class 0x80`,
    );
  }

  if (firmware.description) console.log(`package: ${firmware.description}`);
  console.log(`binary: ${firmware.binLabel} (${bin.length} bytes)`);
  console.log(`init:   ${firmware.datLabel} (${dat.length} bytes)`);
  console.log(
    `init payload hash: ${pkg.hashMatches ? "matches binary" : "does not match binary (expected for patched controller firmware)"}`,
  );
  console.log(`mode: ${execute ? "EXECUTE" : "DRY RUN"}`);

  const scanTime = numberFlag(flags, "--scan-time", 10);
  console.log(
    `scanning ${scanTime}s for manufacturer 0x${APP_MANUFACTURER_ID.toString(16).padStart(4, "0")}`,
  );
  const appDevices = await scanManufacturerDevices(APP_MANUFACTURER_ID, {
    scanTimeSeconds: scanTime,
  });
  const device = selectDevice(
    appDevices,
    requestedId,
    "compatible bikes",
    "rerun with the intended Device ID: mc-farm flash <device-id> and the same firmware options",
  );
  console.log(`selected ${describeDevice(device)}`);

  await confirm(
    flags.has("--yes") || flags.has("-y"),
    execute
      ? `This will write motor-controller firmware to ${describeDevice(device)}.`
      : `This dry run will reboot ${describeDevice(device)} into DFU mode and submit the init packet. It will send no firmware data.`,
  );

  console.log("connecting");
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

  console.log(`waiting for Nordic DFU service (${DFU_SERVICE})`);
  await sleep(5_000);
  console.log(`scanning ${scanTime}s for Nordic DFU service (${DFU_SERVICE})`);
  const dfuDevice = selectDevice(
    await scanServiceDevices(DFU_SERVICE, { scanTimeSeconds: scanTime }),
    undefined,
    "Nordic DFU targets",
    "ensure only the intended DFU target is powered on, then rerun flash",
  );
  console.log(`selected ${describeDevice(dfuDevice)}; connecting`);
  const dfuServer = await connect(dfuDevice, { log: console.log });
  try {
    const result = await transferControllerFirmware(dfuServer, dat, bin, {
      executeFirmware: execute,
      chunkSize: transport.chunkSize,
      objectSize: transport.objectSize,
      prn: transport.prn,
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
  if (command !== "read" && command !== "read-dfu" && command !== "flash") {
    throw new CliUsageError(`unknown command: ${command}`);
  }

  const requestedId = positional[1];
  if (positional.length > 2) throw new CliUsageError(`too many arguments for ${command}`);

  const timeout = numberFlag(flags, "--timeout", 900) * 1_000;
  switch (command) {
    case "read":
      await withDeadline(
        readInfo(requestedId, numberFlag(flags, "--scan-time", 10)),
        timeout,
        "read",
      );
      break;
    case "read-dfu":
      await withDeadline(
        readDfuInfo(
          requestedId,
          flags.has("--arm"),
          numberFlag(flags, "--scan-time", 10),
          flags.has("--yes") || flags.has("-y"),
        ),
        timeout,
        "read-dfu",
      );
      break;
    case "flash": {
      const zipPath = flags.get("--zip");
      const binPath = flags.get("--bin");
      const datPath = flags.get("--dat");
      if (zipPath && (binPath || datPath)) {
        throw new CliUsageError("flash accepts either --zip or --bin with --dat, not both");
      }
      let firmware: ControllerFirmware;
      if (zipPath) {
        const zip = new Uint8Array(await Bun.file(zipPath).arrayBuffer());
        if (zip.length === 0) throw new Error(`firmware archive is empty: ${zipPath}`);
        firmware = await readControllerArchive(zip, zipPath);
      } else {
        if (!binPath || !datPath) {
          throw new CliUsageError("flash requires --zip or both --bin and --dat");
        }
        firmware = {
          bin: new Uint8Array(await Bun.file(binPath).arrayBuffer()),
          dat: new Uint8Array(await Bun.file(datPath).arrayBuffer()),
          binLabel: binPath,
          datLabel: datPath,
        };
      }
      await withDeadline(flash(requestedId, firmware, flags), timeout, "flash");
      break;
    }
  }
}

try {
  await main();
  process.exit(0);
} catch (error) {
  if (error instanceof CliUsageError) showUsage();
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
