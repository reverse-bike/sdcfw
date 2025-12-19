/// <reference types="w3c-web-usb" />

import { ADI, WebUSB as Transport } from "@sdcfw/dapjs";
import type { DAPConnection, Result } from "./types.js";
import { ok, err, createError, toCoreError } from "./types.js";

export const ESP32_S3_VID = 0x303a;
export const ESP32_S3_PID = 0x1002;
export const DEFAULT_CLOCK_SPEED = 10000000; // 10mhz for speed

// Dynamically import usb package to avoid bundling it for browser
let WebUSBNode: any = null;
async function getNodeWebUSB() {
  if (!WebUSBNode) {
    const usbModule = await import("usb");
    WebUSBNode = usbModule.WebUSB;
  }
  return WebUSBNode;
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "Operation",
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(createError("TIMEOUT", `${label} timed out after ${ms}ms`)),
        ms,
      ),
    ),
  ]);
}

export async function findDevice(): Promise<Result<USBDevice>> {
  try {
    const WebUSB = await getNodeWebUSB();
    const webusb = new WebUSB({ allowAllDevices: true });
    const devices = await webusb.getDevices();
    const device = devices.find(
      (d: USBDevice) => d.vendorId === ESP32_S3_VID && d.productId === ESP32_S3_PID,
    );

    if (!device) {
      return err(createError("DEVICE_NOT_FOUND", "ESP32-S3 Bridge not found. Please connect the probe."));
    }

    return ok(device);
  } catch (e) {
    return err(toCoreError(e));
  }
}

export async function connectDAP(
  device: USBDevice,
  clockSpeed = DEFAULT_CLOCK_SPEED,
): Promise<Result<DAPConnection>> {
  try {
    const transport = new Transport(device);
    const dap = new ADI(transport, 0, clockSpeed);

    await withTimeout(dap.connect(), 2000, "Connect");

    // Clear any error flags
    try {
      await dap.writeDP(0x0, 0x1e);
    } catch {
      // Ignore errors during error clearing
    }

    return ok({ dap, transport });
  } catch (e) {
    return err(toCoreError(e));
  }
}

export async function disconnectDAP(connection: DAPConnection): Promise<Result<void>> {
  try {
    await connection.dap.disconnect();
    return ok(undefined);
  } catch (e) {
    return err(toCoreError(e));
  }
}
