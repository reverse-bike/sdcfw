import { WebUSB } from "usb";
import { createError, err, ok, toCoreError, type Result } from "@sdcfw/usb-utils";

const ESP32_S3_VID = 0x303a;
const ESP32_S3_PID = 0x1002;

export async function findDevice(): Promise<Result<USBDevice>> {
  try {
    const webusb = new WebUSB({ allowAllDevices: true });
    const devices = await webusb.getDevices();
    const device = devices.find(
      (candidate) => candidate.vendorId === ESP32_S3_VID && candidate.productId === ESP32_S3_PID,
    );

    if (!device) {
      return err(
        createError("DEVICE_NOT_FOUND", "ESP32-S3 Bridge not found. Please connect the probe."),
      );
    }

    return ok(device as USBDevice);
  } catch (error) {
    return err(toCoreError(error));
  }
}
