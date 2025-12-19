import type { DAPConnection, BackupResult, Result } from "../types.js";
import { ok, err, toCoreError } from "../types.js";
import { readDeviceInfo, readFlash, readUICRBinary } from "../nrf52.js";

export async function backup(
  connection: DAPConnection,
  onProgress?: (message: string) => void,
): Promise<Result<BackupResult>> {
  try {
    const { dap } = connection;

    onProgress?.("Reading device information...");
    const deviceInfo = await readDeviceInfo(dap);

    const flashSize = deviceInfo.flash * 1024; // Convert KB to bytes

    onProgress?.(`Reading flash memory (${flashSize / 1024} KB)...`);
    const flashData = await readFlash(dap, flashSize, (percent) => {
      if (percent % 10 === 0) {
        onProgress?.(`Reading flash: ${percent}%`);
      }
    });

    onProgress?.("Reading UICR region...");
    const uicrData = await readUICRBinary(dap);

    onProgress?.("Backup complete!");

    return ok({
      flashData,
      uicrData,
    });
  } catch (e) {
    return err(toCoreError(e));
  }
}
