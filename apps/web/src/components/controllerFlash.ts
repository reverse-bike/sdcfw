/**
 * Logic behind the guided controller flash, kept out of the component.
 *
 * The flow spans two BLE connections and two user gestures, because Web
 * Bluetooth needs a fresh gesture per chooser and the bootloader advertises as
 * a different device than the running application.
 */
import { connect, type ModuleVersionInfo } from "@sdcfw/ble-utils";
import { readPackage, versionMatchesAny, type ControllerPackage } from "@sdcfw/firmware-utils";

/** A controller release as declared by the site's content collection. */
export interface FirmwareRelease {
  id: string;
  name: string;
  version: string;
  description: string;
  path: string;
  experimental: boolean;
  requires?: {
    controllerVersion: string[];
    controllerVariant?: number[] | undefined;
  };
}

export type Applicability = { ok: true } | { ok: false; reason: string };

/**
 * Whether a release may be flashed onto the bike we just read.
 *
 * Compatibility comes from site content rather than the archive: we expect to
 * learn that more setups work without re-cutting a release. A mismatch blocks
 * rather than warns, because there is no way to read controller firmware back, so a
 * wrong image is not something a user can simply undo.
 */
export function checkApplicability(
  release: FirmwareRelease,
  info: ModuleVersionInfo,
): Applicability {
  const requires = release.requires;
  if (!requires) {
    return {
      ok: false,
      reason: "This release does not say which bikes it supports, so it cannot be offered here.",
    };
  }

  if (!versionMatchesAny(info.controllerVersion, requires.controllerVersion)) {
    return {
      ok: false,
      reason:
        `Your controller reports version ${info.controllerVersion}, and this release is for ` +
        `${requires.controllerVersion.join(", ")}.`,
    };
  }

  const variants = requires.controllerVariant;
  if (variants && !variants.includes(info.controllerVariant)) {
    return {
      ok: false,
      reason:
        `Your controller reports variant ${info.controllerVariant || "unknown"}, and this ` +
        `release is for ${variants.join(", ")}.`,
    };
  }

  return { ok: true };
}

/** Fetch a release archive and verify every file against its manifest. */
export async function fetchRelease(release: FirmwareRelease): Promise<ControllerPackage> {
  const response = await fetch(release.path);
  if (!response.ok) {
    throw new Error(`Could not download ${release.path} (${response.status})`);
  }
  const parsed = await readPackage(new Uint8Array(await response.arrayBuffer()));
  if (parsed.target !== "controller") {
    throw new Error("That archive is display firmware, not motor-controller firmware.");
  }
  return parsed;
}

/**
 * Hold a screen wake lock for the duration of a transfer.
 *
 * This only keeps the screen awake, which matters most on a phone propped next
 * to the bike. It does not exempt a backgrounded tab from timer throttling, and
 * the browser drops the lock once the page is hidden, so the copy telling
 * people to keep the tab in front is doing the real work.
 */
export async function requestWakeLock(): Promise<{ release: () => void }> {
  const lock = await navigator.wakeLock?.request("screen").catch(() => undefined);
  return {
    release: () => void lock?.release().catch(() => {}),
  };
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Reconnect to a bike we already have permission for.
 *
 * Chrome remembers a chosen device for the life of the page, so later steps do
 * not need another chooser. Retries less than a fresh connection would: if the
 * bike has gone, the useful response is to offer the chooser rather than to
 * keep trying for a minute.
 */
export async function reconnect(device: BluetoothDevice, log: (message: string) => void) {
  return connect(device, { attempts: 2, timeoutMs: 10_000, retryDelayMs: 1_500, log });
}

/** Everything a troubleshooting report needs, in one pasteable block. */
export function formatVersionInfo(
  info: ModuleVersionInfo,
  context: { firmware?: string; when: string; userAgent: string },
): string {
  const lines = [
    `reverse.bike controller report (${context.when})`,
    "",
    "Display",
    `  Model:              ${info.model ?? "unknown"}`,
    `  Serial:             ${info.serialNumber ?? "hidden by browser (use the CLI to read it)"}`,
    `  Manufacturer:       ${info.manufacturerName ?? "unknown"}`,
    `  Hardware revision:  ${info.hardwareRevision ?? "unknown"}`,
    `  nRF version:        ${info.nrfVersion ?? "unknown"}`,
    `  Software revision:  ${info.softwareRevision ?? "unknown"}`,
    `  nRF bootloader:     ${info.nrfBootloaderVersion}`,
    `  Firmware variant:   ${info.firmwareVariant}`,
    `  STM version:        ${info.stmVersion}`,
    "",
    "Motor controller",
    `  Version:            ${info.controllerVersion}`,
    `  Variant:            ${info.controllerVariant || "unknown"}`,
    "",
    "Battery",
    `  Version:            ${info.batteryVersion}`,
  ];
  if (context.firmware) {
    lines.push("", `Selected firmware:    ${context.firmware}`);
  }
  lines.push("", `Browser:              ${context.userAgent}`);
  return lines.join("\n");
}

/** Copy to the clipboard, reporting whether it worked so the UI can say so. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
