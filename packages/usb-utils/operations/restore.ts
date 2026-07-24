import type { DAPConnection, RestoreOptions, Result } from "../types.js";
import { ok, err, createError, toCoreError } from "../types.js";
import { writeFlash, verifyFlash, writeUICRBinary } from "../nrf52.js";

export async function restore(
  connection: DAPConnection,
  flashData: Uint8Array,
  uicrData: Uint8Array,
  options: RestoreOptions = {},
  onProgress?: (message: string) => void,
): Promise<Result<void>> {
  try {
    const { dap } = connection;
    const { verify = true } = options;

    onProgress?.(`Flashing ${flashData.length} bytes to device...`);

    await writeFlash(dap, flashData, (percent) => {
      if (percent % 10 === 0) {
        onProgress?.(`Flashing: ${percent}%`);
      }
    });

    onProgress?.("Flash write complete.");

    if (verify) {
      onProgress?.("Verifying flash...");
      const verifyResult = await verifyFlash(dap, flashData, (percent) => {
        if (percent % 10 === 0) {
          onProgress?.(`Verifying: ${percent}%`);
        }
      });

      if (!verifyResult.success) {
        return err(createError("VERIFY_FAILED", `Verification failed with ${verifyResult.errors} errors`));
      }

      onProgress?.("Verification successful!");
    }

    onProgress?.("Restoring UICR region...");
    await writeUICRBinary(dap, uicrData);
    onProgress?.("UICR region restored.");

    // Reset device
    onProgress?.("Resetting device...");
    await dap.reset();

    onProgress?.("Restore complete!");
    return ok(undefined);
  } catch (e) {
    return err(toCoreError(e));
  }
}
