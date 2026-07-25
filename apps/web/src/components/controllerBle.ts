// Shared Web Bluetooth helpers for the controller tools.

import {
  APP_MANUFACTURER_ID,
  APP_SERVICE,
  AUTH_SERVICE,
  DFU_SERVICE,
  DIS_SERVICE,
} from "@sdcfw/ble-utils";

function bluetooth(): Bluetooth {
  if (!navigator.bluetooth) {
    throw new Error(
      "Web Bluetooth is not available in this browser. Use Chrome or another Chromium browser on desktop or Android.",
    );
  }
  return navigator.bluetooth;
}

export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "No device was selected.";
  }
  return error instanceof Error ? error.message : String(error);
}

/** Formats a device as "name [id]", matching the CLI. */
export function describeDevice(device: BluetoothDevice): string {
  const name = device.name ?? "(unnamed)";
  return device.id ? `${name} [${device.id}]` : name;
}

/** Prompts for a bike running its normal application firmware. */
export function requestAppDevice(): Promise<BluetoothDevice> {
  return bluetooth().requestDevice({
    filters: [{ manufacturerData: [{ companyIdentifier: APP_MANUFACTURER_ID }] }],
    optionalServices: [DIS_SERVICE, AUTH_SERVICE, APP_SERVICE, DFU_SERVICE],
  });
}

/**
 * Prompts for a bike that has rebooted into the Nordic DFU bootloader. The
 * bootloader may carry its service UUID in the scan response rather than the
 * advertisement, so its name is offered as a second way to match it.
 */
export function requestDfuDevice(): Promise<BluetoothDevice> {
  return bluetooth().requestDevice({
    filters: [{ services: [DFU_SERVICE] }, { namePrefix: "Dfu" }],
    optionalServices: [DIS_SERVICE, DFU_SERVICE],
  });
}

export function safeDisconnect(server: BluetoothRemoteGATTServer | undefined): void {
  try {
    server?.disconnect();
  } catch {
    // A DFU reboot may have already dropped the link.
  }
}
