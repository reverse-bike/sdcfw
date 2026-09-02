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

/** The user dismissed the device chooser without picking a device. */
export class NoDeviceSelectedError extends Error {
  constructor() {
    super("No device was selected.");
    this.name = "NoDeviceSelectedError";
  }
}

/**
 * Chrome reports a dismissed chooser as a `NotFoundError`, the same name it
 * uses for a missing GATT service or characteristic. Only the chooser call
 * itself can tell the two apart, so it is wrapped here and `errorMessage`
 * leaves every other error's own text alone.
 */
async function choose(request: Promise<BluetoothDevice>): Promise<BluetoothDevice> {
  try {
    return await request;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") {
      throw new NoDeviceSelectedError();
    }
    throw error;
  }
}

/**
 * Chrome's messages for a failed operating-system pairing. The bike's
 * application and auth characteristics require an encrypted link, so the
 * first read of one makes Chrome pair with the bike on the user's behalf (on
 * Windows and Linux; macOS pairs silently). When that fails, all the user sees
 * is "Authentication failed.", which reads as if the bike refused them.
 */
const PAIRING_ERRORS = [
  "Authentication failed.",
  "Authentication rejected.",
  "Authentication timeout.",
  "Authentication canceled.",
  "GATT Error: Not paired.",
  "GATT operation not authorized.",
];

const PAIRING_HINT =
  "This computer could not pair with the bike, which the bike requires before it will share " +
  "anything. If the bike appears in the computer's Bluetooth settings, remove it, power-cycle " +
  "the bike, and try again. A phone that already works with the bike can use this site in " +
  "Chrome instead.";

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (PAIRING_ERRORS.includes(message)) {
    return `${message} ${PAIRING_HINT}`;
  }
  return message;
}

/** Formats a device as "name [id]", matching the CLI. */
export function describeDevice(device: BluetoothDevice): string {
  const name = device.name ?? "(unnamed)";
  return device.id ? `${name} [${device.id}]` : name;
}

/** Prompts for a bike running its normal application firmware. */
export function requestAppDevice(): Promise<BluetoothDevice> {
  return choose(
    bluetooth().requestDevice({
      filters: [{ manufacturerData: [{ companyIdentifier: APP_MANUFACTURER_ID }] }],
      optionalServices: [DIS_SERVICE, AUTH_SERVICE, APP_SERVICE, DFU_SERVICE],
    }),
  );
}

/**
 * Prompts for a bike that has rebooted into the Nordic DFU bootloader. The
 * bootloader may carry its service UUID in the scan response rather than the
 * advertisement, so its name is offered as a second way to match it.
 */
export function requestDfuDevice(): Promise<BluetoothDevice> {
  return choose(
    bluetooth().requestDevice({
      filters: [{ services: [DFU_SERVICE] }, { namePrefix: "Dfu" }],
      optionalServices: [DIS_SERVICE, DFU_SERVICE],
    }),
  );
}

export function safeDisconnect(server: BluetoothRemoteGATTServer | undefined): void {
  try {
    server?.disconnect();
  } catch {
    // A DFU reboot may have already dropped the link.
  }
}
