export {
  findDevice,
  connectDAP,
  disconnectDAP,
  withTimeout,
} from "./connection.js";

// nRF52 operations
export {
  readDeviceInfo,
  readUICR,
  readUICRBinary,
  readBootloaderSettings,
  writeUICR,
  writeUICRBinary,
  readFlash,
  writeFlash,
  verifyFlash,
  performChipErase,
  FICR_BASE,
  UICR_BASE,
  UICR_SIZE,
  NVMC_CONFIG,
  NVMC_READY,
  NVMC_ERASEPAGE,
  FLASH_BASE,
  BOOTLOADER_SETTINGS_ADDR,
} from "./nrf52.js";

// High-level operations
export { backup } from "./operations/backup.js";
export { erase } from "./operations/erase.js";
export { restore } from "./operations/restore.js";

// Types
export type {
  Result,
  CoreError,
  CoreErrorCode,
  DAPConnection,
  DeviceInfo,
  UICRRegisters,
  BootloaderBank,
  DfuProgress,
  BootloaderSettings,
  BackupResult,
  RestoreOptions,
  ProgressCallback,
  DeviceInfoDisplay,
  UICRDisplay,
} from "./types.js";

// Result helpers and error utilities
export {
  ok,
  err,
  createError,
  toCoreError,
  formatDeviceInfo,
  formatUICR,
} from "./types.js";
