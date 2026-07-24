export {
  APP_SERVICE,
  APP_TX_CHAR,
  APP_RX_CHAR,
  HISTORY_SELECT_CHAR,
  AUTH_SERVICE,
  AUTH_CHALLENGE,
  AUTH_RESPONSE,
  AUTH_STATE,
  DFU_SERVICE,
  DFU_CONTROL_POINT,
  DFU_PACKET,
  DFU_BUTTONLESS,
  DIS_SERVICE,
  DIS_FW_REV,
  comoduleUuid,
} from "./constants.js";

export {
  BleTimeoutError,
  bytesOf,
  connect,
  hex,
  sleep,
  withDeadline,
  withTimeout,
  type LogFn,
} from "./util.js";

export { crc32Ieee, crc32Mpeg2Update, deviceImageCrc } from "./crc.js";

export { parseDfuPackage, stagedImage, STAGED_CRC_LEN, type DfuPackage } from "./package.js";

export { authenticate, DEFAULT_AUTH_KEY } from "./auth.js";

export { readVersionInfo, serialFromManufacturerData, type ModuleVersionInfo } from "./info.js";

export { DfuClient, DfuError, type DfuTransferOptions } from "./dfu.js";

export {
  armControllerUpdate,
  controllerImageCrc,
  createArmPacket,
  transferControllerFirmware,
  validateDfuTransportOptions,
  type DfuTransportOptions,
  type FirmwareTransferOptions,
} from "./update.js";
