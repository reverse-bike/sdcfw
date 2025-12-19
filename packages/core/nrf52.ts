import type { ADI } from "@sdcfw/dapjs";
import type {
  DeviceInfo,
  UICRRegisters,
  ProgressCallback,
  BootloaderSettings,
} from "./types.js";
import { createError } from "./types.js";
import { withTimeout } from "./connection.js";

// Helper function to write uint32 in little-endian format
function writeUInt32LE(buffer: Uint8Array, value: number, offset: number): void {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >> 8) & 0xff;
  buffer[offset + 2] = (value >> 16) & 0xff;
  buffer[offset + 3] = (value >> 24) & 0xff;
}

// Helper function to read uint32 in little-endian format
function readUInt32LE(buffer: Uint8Array, offset: number): number {
  return (
    buffer[offset]! |
    (buffer[offset + 1]! << 8) |
    (buffer[offset + 2]! << 16) |
    (buffer[offset + 3]! << 24)
  ) >>> 0;
}

// Memory Map Constants
export const FICR_BASE = 0x10000000;
export const UICR_BASE = 0x10001000;
export const UICR_SIZE = 0x400; // 1KB UICR region
export const NVMC_CONFIG = 0x4001e504;
export const NVMC_READY = 0x4001e400;
export const NVMC_ERASEPAGE = 0x4001e508;
export const FLASH_BASE = 0x00000000;
export const BOOTLOADER_SETTINGS_ADDR = 0x0007f000;

// FICR Offsets
const FICR_CODEPAGESIZE = 0x010;
const FICR_CODESIZE = 0x014;
const FICR_DEVICEID_0 = 0x060;
const FICR_DEVICEID_1 = 0x064;
const FICR_DEVICEADDR_0 = 0x0a4;
const FICR_DEVICEADDR_1 = 0x0a8;
const FICR_DEVICEADDR_TYPE = 0x0a0;
const FICR_INFO_PART = 0x100;
const FICR_INFO_VARIANT = 0x104;
const FICR_INFO_PACKAGE = 0x108;
const FICR_INFO_RAM = 0x10c;
const FICR_INFO_FLASH = 0x110;

// UICR Offsets
const UICR_PSELRESET_0 = 0x200;
const UICR_PSELRESET_1 = 0x204;
const UICR_APPROTECT = 0x208;
const UICR_NFCPINS = 0x20c;
const UICR_NRFFW_0 = 0x014;
const UICR_NRFFW_1 = 0x018;

export async function readDeviceInfo(dap: ADI): Promise<DeviceInfo> {
  const codepagesize = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_CODEPAGESIZE),
    1000,
    "Read CODEPAGESIZE",
  );
  const codesize = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_CODESIZE),
    1000,
    "Read CODESIZE",
  );
  const deviceId0 = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_DEVICEID_0),
    1000,
    "Read DEVICEID[0]",
  );
  const deviceId1 = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_DEVICEID_1),
    1000,
    "Read DEVICEID[1]",
  );
  const deviceAddr0 = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_DEVICEADDR_0),
    1000,
    "Read DEVICEADDR[0]",
  );
  const deviceAddr1 = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_DEVICEADDR_1),
    1000,
    "Read DEVICEADDR[1]",
  );
  const deviceAddrType = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_DEVICEADDR_TYPE),
    1000,
    "Read DEVICEADDRTYPE",
  );
  const part = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_INFO_PART),
    1000,
    "Read PART",
  );
  const variant = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_INFO_VARIANT),
    1000,
    "Read VARIANT",
  );
  const packageInfo = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_INFO_PACKAGE),
    1000,
    "Read PACKAGE",
  );
  const ram = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_INFO_RAM),
    1000,
    "Read RAM",
  );
  const flash = await withTimeout(
    dap.readMem32(FICR_BASE + FICR_INFO_FLASH),
    1000,
    "Read FLASH",
  );

  return {
    part,
    variant,
    package: packageInfo,
    ram,
    flash,
    deviceId: [deviceId0, deviceId1],
    deviceAddr: [deviceAddr0, deviceAddr1],
    deviceAddrType,
    codepagesize,
    codesize,
  };
}

export async function readUICR(dap: ADI): Promise<UICRRegisters> {
  const pselreset0 = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_PSELRESET_0),
    1000,
    "Read PSELRESET[0]",
  );
  const pselreset1 = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_PSELRESET_1),
    1000,
    "Read PSELRESET[1]",
  );
  const approtect = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_APPROTECT),
    1000,
    "Read APPROTECT",
  );
  const nfcpins = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_NFCPINS),
    1000,
    "Read NFCPINS",
  );
  const nrffw0 = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_NRFFW_0),
    1000,
    "Read NRFFW[0]",
  );
  const nrffw1 = await withTimeout(
    dap.readMem32(UICR_BASE + UICR_NRFFW_1),
    1000,
    "Read NRFFW[1]",
  );

  return {
    pselreset0,
    pselreset1,
    approtect,
    nfcpins,
    nrffw0,
    nrffw1,
  };
}

export async function readUICRBinary(dap: ADI): Promise<Uint8Array> {
  const wordsToRead = UICR_SIZE / 4; // 256 words for 1KB
  const buffer = new Uint8Array(UICR_SIZE);

  const dataWords = await withTimeout(
    dap.readBlock(UICR_BASE, wordsToRead),
    2000,
    "Read UICR Block",
  );

  // Convert Uint32Array to Uint8Array (Little Endian)
  for (let i = 0; i < dataWords.length; i++) {
    writeUInt32LE(buffer, dataWords[i]!, i * 4);
  }

  return buffer;
}

export async function readBootloaderSettings(
  dap: ADI,
): Promise<BootloaderSettings | null> {
  try {
    // Read first 92 bytes (23 words) of the nrf_dfu_settings_t struct
    const words = await withTimeout(
      dap.readBlock(BOOTLOADER_SETTINGS_ADDR, 23),
      2000,
      "Read Bootloader Settings",
    );

    // Convert to Uint8Array for easier byte access
    const buffer = new Uint8Array(92);
    for (let i = 0; i < 23; i++) {
      writeUInt32LE(buffer, words[i]!, i * 4);
    }

    // Parse the nrf_dfu_settings_t struct
    const crc = readUInt32LE(buffer, 0);
    const settingsVersion = readUInt32LE(buffer, 4);
    const appVersion = readUInt32LE(buffer, 8);
    const bootloaderVersion = readUInt32LE(buffer, 12);
    const bankLayout = readUInt32LE(buffer, 16);
    const bankCurrent = readUInt32LE(buffer, 20);

    // bank_0 (nrf_dfu_bank_t at offset 24)
    const bank0 = {
      imageSize: readUInt32LE(buffer, 24),
      imageCrc: readUInt32LE(buffer, 28),
      bankCode: readUInt32LE(buffer, 32),
    };

    // bank_1 (nrf_dfu_bank_t at offset 36)
    const bank1 = {
      imageSize: readUInt32LE(buffer, 36),
      imageCrc: readUInt32LE(buffer, 40),
      bankCode: readUInt32LE(buffer, 44),
    };

    const writeOffset = readUInt32LE(buffer, 48);
    const sdSize = readUInt32LE(buffer, 52);

    // dfu_progress_t (at offset 56)
    const progress = {
      commandSize: readUInt32LE(buffer, 56),
      commandOffset: readUInt32LE(buffer, 60),
      commandCrc: readUInt32LE(buffer, 64),
      dataObjectSize: readUInt32LE(buffer, 68),
      firmwareImageCrc: readUInt32LE(buffer, 72),
      firmwareImageCrcLast: readUInt32LE(buffer, 76),
      firmwareImageOffset: readUInt32LE(buffer, 80),
      firmwareImageOffsetLast: readUInt32LE(buffer, 84),
    };

    const enterButtonlessDfu = readUInt32LE(buffer, 88);

    // Check if settings are valid (not all 0xFF which indicates erased flash)
    if (crc === 0xffffffff) {
      return null; // Settings not present
    }

    return {
      crc,
      settingsVersion,
      appVersion,
      bootloaderVersion,
      bankLayout,
      bankCurrent,
      bank0,
      bank1,
      writeOffset,
      sdSize,
      progress,
      enterButtonlessDfu,
    };
  } catch {
    // Failed to read, probably no bootloader settings present
    return null;
  }
}

export async function writeUICR(dap: ADI, uicr: UICRRegisters): Promise<void> {
  // Enable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000001),
    1000,
    "Enable NVMC",
  );

  // Wait for NVMC to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Write UICR registers
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_PSELRESET_0, uicr.pselreset0),
    1000,
    "Write PSELRESET[0]",
  );
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_PSELRESET_1, uicr.pselreset1),
    1000,
    "Write PSELRESET[1]",
  );
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_NFCPINS, uicr.nfcpins),
    1000,
    "Write NFCPINS",
  );
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_NRFFW_0, uicr.nrffw0),
    1000,
    "Write NRFFW[0]",
  );
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_NRFFW_1, uicr.nrffw1),
    1000,
    "Write NRFFW[1]",
  );
  await withTimeout(
    dap.writeMem32(UICR_BASE + UICR_APPROTECT, uicr.approtect),
    1000,
    "Write APPROTECT",
  );

  // Disable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000000),
    1000,
    "Disable NVMC",
  );
}

export async function writeUICRBinary(dap: ADI, data: Uint8Array): Promise<void> {
  if (data.length !== UICR_SIZE) {
    throw createError(
      "INVALID_DATA",
      `UICR data must be exactly ${UICR_SIZE} bytes, got ${data.length}`,
    );
  }

  // Enable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000001),
    1000,
    "Enable NVMC",
  );

  // Wait for NVMC to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Write UICR in one block
  const wordsToWrite = UICR_SIZE / 4;
  const words = new Uint32Array(wordsToWrite);

  for (let i = 0; i < wordsToWrite; i++) {
    words[i] = readUInt32LE(data, i * 4);
  }

  await withTimeout(
    dap.writeBlock(UICR_BASE, words),
    5000,
    "Write UICR Block",
  );

  // Disable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000000),
    1000,
    "Disable NVMC",
  );
}

export async function readFlash(
  dap: ADI,
  size: number,
  progressCallback?: ProgressCallback,
): Promise<Uint8Array> {
  const chunkSize = 4096; // 4KB chunks
  const buffer = new Uint8Array(size);
  let offset = 0;

  while (offset < size) {
    const remaining = size - offset;
    const readSize = Math.min(chunkSize, remaining);
    const wordsToRead = Math.ceil(readSize / 4);

    const dataWords = await withTimeout(
      dap.readBlock(FLASH_BASE + offset, wordsToRead),
      2000,
      "Read Flash Block",
    );

    // Convert Uint32Array to Uint8Array (Little Endian)
    for (let i = 0; i < dataWords.length; i++) {
      const byteOffset = offset + i * 4;
      if (byteOffset < size) {
        writeUInt32LE(buffer, dataWords[i]!, byteOffset);
      }
    }

    offset += readSize;

    if (progressCallback) {
      const percent = Math.floor((offset / size) * 100);
      progressCallback(percent);
    }
  }

  if (progressCallback) {
    progressCallback(100);
  }

  return buffer;
}

export async function writeFlash(
  dap: ADI,
  data: Uint8Array,
  progressCallback?: ProgressCallback,
): Promise<void> {
  // Enable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000001),
    1000,
    "Enable NVMC",
  );

  // Wait for NVMC to be ready
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Write in chunks using writeBlock for speed
  const chunkSize = 4096; // 4KB chunks
  let offset = 0;

  while (offset < data.length) {
    const remaining = data.length - offset;
    const writeSize = Math.min(chunkSize, remaining);
    const wordsToWrite = Math.ceil(writeSize / 4);

    // Convert Uint8Array to Uint32Array
    const words = new Uint32Array(wordsToWrite);
    for (let i = 0; i < wordsToWrite; i++) {
      const byteOffset = offset + i * 4;
      if (byteOffset + 4 <= data.length) {
        words[i] = readUInt32LE(data, byteOffset);
      } else {
        // Pad with 0xFF (flash erased state)
        const padded = new Uint8Array(4);
        padded.fill(0xff);
        const remaining = data.length - byteOffset;
        padded.set(data.slice(byteOffset, byteOffset + remaining), 0);
        words[i] = readUInt32LE(padded, 0);
      }
    }

    // Write block
    await withTimeout(
      dap.writeBlock(FLASH_BASE + offset, words),
      5000,
      "Write Flash Block",
    );

    offset += writeSize;

    if (progressCallback) {
      const percent = Math.floor((offset / data.length) * 100);
      progressCallback(percent);
    }

    // Small delay to let NVMC catch up
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  if (progressCallback) {
    progressCallback(100);
  }

  // Disable NVMC Write
  await withTimeout(
    dap.writeMem32(NVMC_CONFIG, 0x00000000),
    1000,
    "Disable NVMC",
  );
}

export async function verifyFlash(
  dap: ADI,
  expectedData: Uint8Array,
  progressCallback?: ProgressCallback,
): Promise<{ success: boolean; errors: number }> {
  let errors = 0;

  // Read in chunks using readBlock for speed
  const chunkSize = 4096; // 4KB chunks
  let offset = 0;

  while (offset < expectedData.length) {
    const remaining = expectedData.length - offset;
    const readSize = Math.min(chunkSize, remaining);
    const wordsToRead = Math.ceil(readSize / 4);

    // Read block from flash
    const actualWords = await withTimeout(
      dap.readBlock(FLASH_BASE + offset, wordsToRead),
      2000,
      "Read Flash Block",
    );

    // Compare with expected data
    for (let i = 0; i < actualWords.length; i++) {
      const byteOffset = offset + i * 4;
      let expectedWord = 0;

      if (byteOffset + 4 <= expectedData.length) {
        expectedWord = readUInt32LE(expectedData, byteOffset);
      } else {
        // Pad with 0xFF for partial word at end
        const padded = new Uint8Array(4);
        padded.fill(0xff);
        const remaining = expectedData.length - byteOffset;
        padded.set(expectedData.slice(byteOffset, byteOffset + remaining), 0);
        expectedWord = readUInt32LE(padded, 0);
      }

      if (actualWords[i] !== expectedWord) {
        errors++;
        if (errors <= 5) {
          console.log(
            `Verify error at 0x${(FLASH_BASE + byteOffset).toString(16)}: expected 0x${expectedWord.toString(16)}, got 0x${actualWords[i]!.toString(16)}`,
          );
        }
      }
    }

    offset += readSize;

    if (progressCallback) {
      const percent = Math.floor((offset / expectedData.length) * 100);
      progressCallback(percent);
    }
  }

  if (progressCallback) {
    progressCallback(100);
  }

  return { success: errors === 0, errors };
}

export async function performChipErase(dap: ADI): Promise<void> {
  // For nRF52, ERASEALL is accessed through CTRL-AP (AP #1)
  // Based on OpenOCD nrf52_recover implementation
  // CTRL-AP Register Map:
  // Register 0: RESET
  // Register 4: ERASEALL
  // Register 8: ERASEALLSTATUS (0 = complete)
  // Register 0xFC: IDR (should be 0x02880000)

  console.log("Preparing for ERASEALL...");

  try {
    // Clear any existing errors
    await dap.writeDP(0x0, 0x1e);

    // dapjs readAP/writeAP encode both AP number and register offset in a single parameter
    // Format: APSEL[31:24] | APBANKSEL[7:4] | Register[3:2]
    // For CTRL-AP (AP #1), we need to set bits 31:24 to 1
    const CTRL_AP = 0x01000000; // AP #1

    // Select CTRL-AP (AP #1 for nRF52) via DP SELECT register
    console.log("Selecting CTRL-AP (AP #1)...");
    await withTimeout(dap.writeDP(0x8, CTRL_AP), 2000, "Select CTRL-AP");

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify CTRL-AP IDR at register 0xFC
    console.log("Verifying CTRL-AP IDR...");
    try {
      const idr = await withTimeout(
        dap.readAP(CTRL_AP | 0xfc),
        2000,
        "Read IDR",
      );

      if (idr === undefined || idr === null) {
        console.log("Warning: Could not read CTRL-AP IDR (undefined)");
      } else {
        console.log(
          `CTRL-AP IDR = 0x${idr.toString(16).padStart(8, "0").toUpperCase()}`,
        );

        if (idr === 0xffffffff) {
          console.log(
            "Warning: Got 0xFFFFFFFF - CTRL-AP may not be accessible",
          );
        } else if (idr !== 0x02880000) {
          console.log(
            `Warning: CTRL-AP IDR mismatch! Expected 0x02880000, got 0x${idr.toString(16).padStart(8, "0").toUpperCase()}`,
          );
        } else {
          console.log("✓ CTRL-AP verified.");
        }
      }
    } catch (e) {
      console.log(`Warning: Could not verify CTRL-AP IDR: ${e}`);
    }

    // Reset and trigger ERASEALL task
    // Register 4 (0x04) is ERASEALL
    console.log("Resetting ERASEALL register...");
    await withTimeout(
      dap.writeAP(CTRL_AP | 0x04, 0x00000000),
      2000,
      "Clear ERASEALL",
    );

    console.log("Triggering ERASEALL...");
    await withTimeout(
      dap.writeAP(CTRL_AP | 0x04, 0x00000001),
      2000,
      "Set ERASEALL",
    );

    // Poll ERASEALLSTATUS (register 8) until it becomes 0
    console.log("Waiting for chip erase...");
    let eraseComplete = false;
    const maxAttempts = 150; // 15 seconds total (150 * 100ms)

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));

      const status = await withTimeout(
        dap.readAP(CTRL_AP | 0x08),
        2000,
        "Read ERASEALLSTATUS",
      );

      if (status === 0x00000000) {
        console.log("✓ Device has been successfully erased and unlocked.");
        eraseComplete = true;
        break;
      }

      if (i % 10 === 0) {
        console.log(
          `Still erasing... (${i / 10}s) - status: 0x${status.toString(16)}`,
        );
      }
    }

    if (!eraseComplete) {
      throw createError("ERASE_FAILED", "Erase timeout - operation did not complete in time.");
    }

    // Assert reset (write 1 to register 0)
    // Note: Reset may not always work depending on target state, but erase is complete
    console.log("Asserting reset...");
    try {
      await withTimeout(
        dap.writeAP(CTRL_AP | 0x00, 0x00000001),
        2000,
        "Assert RESET",
      );

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Deassert reset (write 0 to register 0)
      console.log("Deasserting reset...");
      await withTimeout(
        dap.writeAP(CTRL_AP | 0x00, 0x00000000),
        2000,
        "Deassert RESET",
      );
    } catch (e) {
      console.log(
        `Warning: Reset failed (${e}), but erase completed successfully.`,
      );
    }

    // Reset ERASEALL task (write 0 to register 4)
    console.log("Clearing ERASEALL register...");
    try {
      await withTimeout(
        dap.writeAP(CTRL_AP | 0x04, 0x00000000),
        2000,
        "Clear ERASEALL",
      );
    } catch (e) {
      console.log(`Warning: Could not clear ERASEALL register: ${e}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    console.log("Erase operation complete.");
  } catch (e) {
    throw createError("ERASE_FAILED", `Chip erase failed: ${e}`, { cause: e });
  }

  // Clear any error flags
  try {
    await dap.writeDP(0x0, 0x1e);
  } catch {
    // Ignore errors when clearing flags
  }

  // Re-select MEM-AP (AP #0) for normal operation
  try {
    console.log("Re-selecting MEM-AP (AP #0) for normal operation...");
    await dap.writeDP(0x8, 0x00000000);
  } catch (e) {
    console.log("Warning re-selecting MEM-AP:", e);
  }

  // Small delay to let the device stabilize
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
