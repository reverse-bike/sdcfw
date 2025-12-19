import type { ADI, WebUSB as Transport } from "@sdcfw/dapjs";

// ============================================================================
// Result Pattern
// ============================================================================

export type Result<T, E = CoreError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// Error Types
// ============================================================================

export type CoreErrorCode =
  | "TARGET_NOT_CONNECTED"    // Target MCU not connected or not responding
  | "TRANSFER_FAILED"         // DAP transfer failed (recoverable)
  | "TIMEOUT"                 // Operation timed out (recoverable)
  | "DEVICE_NOT_FOUND"        // USB device not found
  | "CONNECTION_FAILED"       // Failed to establish DAP connection
  | "INVALID_DATA"            // Invalid data format or size
  | "ERASE_FAILED"            // Chip erase failed
  | "WRITE_FAILED"            // Flash write failed
  | "VERIFY_FAILED"           // Flash verification failed
  | "UNKNOWN";                // Unknown error

export interface CoreError {
  code: CoreErrorCode;
  message: string;
  recoverable: boolean;       // Can retry after reconnecting
  cause?: unknown;            // Original error
}

export function createError(
  code: CoreErrorCode,
  message: string,
  options?: { recoverable?: boolean; cause?: unknown }
): CoreError {
  const recoverable = options?.recoverable ?? isRecoverableCode(code);
  return { code, message, recoverable, cause: options?.cause };
}

function isRecoverableCode(code: CoreErrorCode): boolean {
  return code === "TARGET_NOT_CONNECTED" ||
         code === "TRANSFER_FAILED" ||
         code === "TIMEOUT";
}

// Helper to convert unknown errors to CoreError
export function toCoreError(err: unknown): CoreError {
  if (err && typeof err === "object" && "code" in err && "message" in err) {
    return err as CoreError;
  }

  const message = err instanceof Error ? err.message : String(err);

  // Classify known error patterns
  if (message.includes("Transfer count mismatch")) {
    return createError("TRANSFER_FAILED", message, { cause: err });
  }
  if (message.includes("timed out")) {
    return createError("TIMEOUT", message, { cause: err });
  }
  if (message.includes("No DP response") || message.includes("WAIT response")) {
    return createError("TARGET_NOT_CONNECTED", message, { cause: err });
  }
  if (message.includes("not found")) {
    return createError("DEVICE_NOT_FOUND", message, { recoverable: false, cause: err });
  }

  return createError("UNKNOWN", message, { recoverable: false, cause: err });
}

// ============================================================================
// Domain Types
// ============================================================================

export interface DAPConnection {
  dap: ADI;
  transport: typeof Transport.prototype;
}

export interface DeviceInfo {
  part: number;
  variant: number;
  package: number;
  ram: number;
  flash: number;
  deviceId: [number, number];
  deviceAddr: [number, number];
  deviceAddrType: number;
  codepagesize: number;
  codesize: number;
}

export interface UICRRegisters {
  pselreset0: number;
  pselreset1: number;
  nfcpins: number;
  approtect: number;
  nrffw0: number;
  nrffw1: number;
}

export interface BootloaderBank {
  imageSize: number;
  imageCrc: number;
  bankCode: number;
}

export interface DfuProgress {
  commandSize: number;
  commandOffset: number;
  commandCrc: number;
  dataObjectSize: number;
  firmwareImageCrc: number;
  firmwareImageCrcLast: number;
  firmwareImageOffset: number;
  firmwareImageOffsetLast: number;
}

export interface BootloaderSettings {
  crc: number;
  settingsVersion: number;
  appVersion: number;
  bootloaderVersion: number;
  bankLayout: number;
  bankCurrent: number;
  bank0: BootloaderBank;
  bank1: BootloaderBank;
  writeOffset: number;
  sdSize: number;
  progress: DfuProgress;
  enterButtonlessDfu: number;
}

export interface BackupResult {
  flashData: Uint8Array;
  uicrData: Uint8Array;
}

export interface RestoreOptions {
  verify?: boolean;
}

export interface ProgressCallback {
  (percent: number, message?: string): void;
}

// ============================================================================
// Display Formatting
// ============================================================================

export interface DeviceInfoDisplay {
  part: string;
  variant: string;
  package: string;
  ram: string;
  flash: string;
  deviceId: string;
  macAddress: string;
  macType: string;
}

export interface UICRDisplay {
  approtect: string;
  approtectEnabled: boolean;
  resetPin0: string;
  resetPin1: string;
  nfcPins: string;
  bootloaderAddr: string;
}

function toHex(val: number): string {
  return "0x" + (val >>> 0).toString(16).toUpperCase().padStart(8, "0");
}

const PACKAGE_NAMES: Record<number, string> = {
  0x2000: "QF (48-pin QFN)",
  0x2001: "CH (7x7 BGA)",
  0x2002: "CI (5x5 BGA)",
  0x2005: "QK",
};

export function formatDeviceInfo(info: DeviceInfo): DeviceInfoDisplay {
  // Part number: nRF52832 etc
  const part = `nRF${info.part.toString(16).toUpperCase()}`;

  // Variant: decode 4-byte ASCII
  const variantBytes = new Uint8Array(4);
  variantBytes[0] = (info.variant >> 24) & 0xff;
  variantBytes[1] = (info.variant >> 16) & 0xff;
  variantBytes[2] = (info.variant >> 8) & 0xff;
  variantBytes[3] = info.variant & 0xff;
  const variant = new TextDecoder().decode(variantBytes).replace(/\0/g, "");

  // Package
  const pkg = PACKAGE_NAMES[info.package] || "Unknown";

  // RAM and Flash
  const ram = `${info.ram} kB`;
  const flash = `${info.flash} kB`;

  // Device ID: combine two 32-bit values
  const deviceId =
    "0x" +
    toHex(info.deviceId[1]).substring(2) +
    toHex(info.deviceId[0]).substring(2);

  // MAC Address
  const macAddress =
    toHex(info.deviceAddr[1]).substring(2) +
    toHex(info.deviceAddr[0]).substring(2);
  const macType = info.deviceAddrType === 0xffffffff ? "Random Static" : "Public";

  return {
    part,
    variant,
    package: pkg,
    ram,
    flash,
    deviceId,
    macAddress,
    macType,
  };
}

export function formatUICR(uicr: UICRRegisters): UICRDisplay {
  // APPROTECT
  const approtectEnabled = (uicr.approtect & 0xff) === 0x00;
  const approtect = approtectEnabled ? "Enabled (Protected)" : "Disabled (Unlocked)";

  // Reset pins
  const resetPin0 =
    uicr.pselreset0 & 0x80000000
      ? "Disconnected"
      : `Pin ${uicr.pselreset0 & 0xff}`;
  const resetPin1 =
    uicr.pselreset1 & 0x80000000
      ? "Disconnected"
      : `Pin ${uicr.pselreset1 & 0xff}`;

  // NFC Pins
  const nfcPins = (uicr.nfcpins & 0x01) === 0 ? "GPIO" : "NFC Antenna";

  // Bootloader address
  const bootloaderAddr =
    uicr.nrffw0 === 0xffffffff ? "Not Set" : toHex(uicr.nrffw0);

  return {
    approtect,
    approtectEnabled,
    resetPin0,
    resetPin1,
    nfcPins,
    bootloaderAddr,
  };
}
