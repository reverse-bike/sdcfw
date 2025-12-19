import type { DAPConnection, Result } from "../types.js";
import { ok, err, toCoreError } from "../types.js";
import { performChipErase, FLASH_BASE, UICR_BASE } from "../nrf52.js";
import { withTimeout } from "../connection.js";

export async function erase(
  connection: DAPConnection,
  onProgress?: (message: string) => void,
): Promise<Result<void>> {
  try {
    const { dap } = connection;

    onProgress?.("Starting chip erase (ERASEALL)...");
    onProgress?.("This will erase all flash and UICR, removing APPROTECT.");

    await performChipErase(dap);

    onProgress?.("Verifying erase...");

    // Check a few locations to verify erase worked
    try {
      const flash0 = await withTimeout(
        dap.readMem32(FLASH_BASE),
        1000,
        "Verify Flash Start",
      );
      const flash1k = await withTimeout(
        dap.readMem32(FLASH_BASE + 0x400),
        1000,
        "Verify Flash 1KB",
      );
      const uicr = await withTimeout(
        dap.readMem32(UICR_BASE + 0x208),
        1000,
        "Verify UICR APPROTECT",
      );

      onProgress?.(
        `Flash[0x00000000] = 0x${flash0.toString(16).padStart(8, "0").toUpperCase()}`,
      );
      onProgress?.(
        `Flash[0x00000400] = 0x${flash1k.toString(16).padStart(8, "0").toUpperCase()}`,
      );
      onProgress?.(
        `UICR APPROTECT   = 0x${uicr.toString(16).padStart(8, "0").toUpperCase()}`,
      );

      if (
        flash0 === 0xffffffff &&
        flash1k === 0xffffffff &&
        uicr === 0xffffffff
      ) {
        onProgress?.(
          "✓ Erase verified successfully. All checked locations show 0xFFFFFFFF.",
        );
      } else {
        onProgress?.(
          "⚠ Warning: Some locations are not 0xFFFFFFFF. Erase may have been incomplete.",
        );
      }
    } catch (e) {
      const coreErr = toCoreError(e);
      onProgress?.(`⚠ Could not verify erase: ${coreErr.message}`);
    }

    onProgress?.("Chip erase complete. Device is now unlocked.");
    return ok(undefined);
  } catch (e) {
    return err(toCoreError(e));
  }
}
