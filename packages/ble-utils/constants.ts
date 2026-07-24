export const COMODULE_BASE = "-1212-efde-1523-785feabcd123";
export const APP_MANUFACTURER_ID = 0x020f;

export function comoduleUuid(short: number): string {
  return `0000${short.toString(16).padStart(4, "0")}${COMODULE_BASE}`;
}

export const APP_SERVICE = comoduleUuid(0x1554);
export const APP_TX_CHAR = comoduleUuid(0x155e);
export const APP_RX_CHAR = comoduleUuid(0x155f);
export const HISTORY_SELECT_CHAR = comoduleUuid(0x1564);

export const AUTH_SERVICE = comoduleUuid(0x2554);
export const AUTH_CHALLENGE = comoduleUuid(0x2556);
export const AUTH_RESPONSE = comoduleUuid(0x2557);
export const AUTH_STATE = comoduleUuid(0x2558);

export const DFU_SERVICE = "0000fe59-0000-1000-8000-00805f9b34fb";
export const DFU_CONTROL_POINT = "8ec90001-f315-4f60-9fb8-838830daea50";
export const DFU_PACKET = "8ec90002-f315-4f60-9fb8-838830daea50";
export const DFU_BUTTONLESS = "8ec90003-f315-4f60-9fb8-838830daea50";

export const DIS_SERVICE = "0000180a-0000-1000-8000-00805f9b34fb";
export const DIS_FW_REV = "00002a26-0000-1000-8000-00805f9b34fb";
