import { For, Show, createEffect, createMemo, createSignal, onCleanup, type JSX } from "solid-js";
import {
  armControllerUpdate,
  connect,
  parseDfuPackage,
  readVersionInfo,
  transferControllerFirmware,
  type ModuleVersionInfo,
} from "@sdcfw/ble-utils";
import { MissingManifestError, readPackage, type ControllerPackage } from "@sdcfw/firmware-utils";
import Button from "./Button";
import Callout from "./Callout";
import CopyButton from "./CopyButton";
import LogPanel from "./LogPanel";
import StatusMessage from "./StatusMessage";
import {
  describeDevice,
  errorMessage,
  requestAppDevice,
  requestDfuDevice,
  safeDisconnect,
} from "./controllerBle";
import {
  checkApplicability,
  fetchRelease,
  formatVersionInfo,
  reconnect,
  requestWakeLock,
  type FirmwareRelease,
} from "./controllerFlash";

interface ControllerGuideProps {
  releases: FirmwareRelease[];
}

type Busy = false | "reading" | "loading" | "arming" | "flashing" | "checking";

export default function ControllerGuide(props: ControllerGuideProps) {
  const [busy, setBusy] = createSignal<Busy>(false);
  const [error, setError] = createSignal("");
  const [log, setLog] = createSignal<string[]>([]);

  const [device, setDevice] = createSignal<BluetoothDevice | null>(null);
  const [info, setInfo] = createSignal<ModuleVersionInfo | null>(null);
  const [selected, setSelected] = createSignal<FirmwareRelease | null>(null);
  const [pkg, setPkg] = createSignal<ControllerPackage | null>(null);
  const [uploaded, setUploaded] = createSignal("");
  const [armed, setArmed] = createSignal(false);
  const [dryRun, setDryRun] = createSignal(false);
  const [sent, setSent] = createSignal(0);
  const [outcome, setOutcome] = createSignal<"none" | "dry" | "sent">("none");
  const [flashFailed, setFlashFailed] = createSignal(false);
  const [checked, setChecked] = createSignal<{ ok: boolean; reported: number } | null>(null);
  const [needsPicker, setNeedsPicker] = createSignal(false);

  const append = (message: string) => setLog((lines) => [...lines, message]);

  // From arming until the firmware is sent, the bike sits in its bootloader
  // and cannot be ridden. Closing the tab in that window strands it, so let
  // the browser ask first.
  createEffect(() => {
    if (!armed() || outcome() === "sent") return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    onCleanup(() => window.removeEventListener("beforeunload", guard));
  });
  const supported = typeof navigator !== "undefined" && Boolean(navigator.bluetooth);
  const idle = () => busy() === false;

  const offers = createMemo(() => {
    const value = info();
    if (!value) return [];
    return props.releases
      .map((release) => ({ release, applicability: checkApplicability(release, value) }))
      .filter((offer) => offer.applicability.ok);
  });

  const report = () =>
    formatVersionInfo(info()!, {
      when: new Date().toISOString(),
      userAgent: navigator.userAgent,
      ...(selected() ? { firmware: `${selected()!.name} v${selected()!.version}` } : {}),
    });

  // Step 1 ────────────────────────────────────────────────────────────────
  const read = async () => {
    setError("");
    setBusy("reading");
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const chosen = await requestAppDevice();
      setDevice(chosen);
      append(`Connecting to ${describeDevice(chosen)}…`);
      // A freshly chosen device gets the patient retries; later steps fail
      // faster so they can offer the chooser again.
      server = await connect(chosen, { log: append });
      const value = await readVersionInfo(server);
      setInfo(value);
      append(`Controller reports version ${value.controllerVersion}.`);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setBusy(false);
    }
  };

  /**
   * Forget an attempt in progress.
   *
   * Arming stages one specific image on the display, so choosing different
   * firmware invalidates it: the bike is still armed for the old one until it
   * is armed again. Clearing the results too stops a previous run's success
   * being read as this one's.
   */
  const resetAttempt = () => {
    setArmed(false);
    setOutcome("none");
    setFlashFailed(false);
    setSent(0);
    setChecked(null);
  };

  const usePackage = async (parsed: ControllerPackage, label: string) => {
    const dfu = await parseDfuPackage(parsed.dat, parsed.bin);
    if (dfu.appSize !== parsed.bin.length) {
      throw new Error("That package is inconsistent: its init packet does not match its firmware.");
    }
    if (dfu.fwVersion !== 0x80) {
      throw new Error("That package is not motor-controller firmware.");
    }
    setPkg(parsed);
    resetAttempt();
    append(`Using ${label}.`);
  };

  const choose = async (release: FirmwareRelease) => {
    setError("");
    setBusy("loading");
    // Drop the old package first: a failure here must not leave the previous
    // one armed and ready to send behind an error message.
    setPkg(null);
    resetAttempt();
    try {
      setUploaded("");
      setSelected(release);
      await usePackage(await fetchRelease(release), `${release.name} v${release.version}`);
    } catch (cause) {
      setSelected(null);
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setError("");
    setBusy("loading");
    setPkg(null);
    resetAttempt();
    try {
      const parsed = await readPackage(new Uint8Array(await file.arrayBuffer()));
      if (parsed.target !== "controller") {
        throw new Error("That archive is display firmware, not motor-controller firmware.");
      }
      setSelected(null);
      setUploaded(file.name);
      await usePackage(parsed, file.name);
    } catch (cause) {
      setUploaded("");
      setError(
        cause instanceof MissingManifestError
          ? "That zip is not a firmware package from this site."
          : errorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  // Step 2 ────────────────────────────────────────────────────────────────
  const arm = async (pick: boolean) => {
    const parsed = pkg();
    if (!parsed) return;
    setError("");
    setBusy("arming");
    resetAttempt();
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const target = pick ? await requestAppDevice() : device();
      if (!target) throw new Error("No bike selected.");
      setDevice(target);
      setNeedsPicker(false);
      append(`Connecting to ${describeDevice(target)}…`);
      server = await reconnect(target, append);
      await armControllerUpdate(server, parsed.bin, { log: append });
      setArmed(true);
      append("The display should now show Updating Firmware.");
    } catch (cause) {
      // A fresh gesture is needed for the chooser, so offer it as its own button.
      if (!pick) setNeedsPicker(true);
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setBusy(false);
    }
  };

  // Step 3 ────────────────────────────────────────────────────────────────
  const flash = async () => {
    const parsed = pkg();
    if (!parsed) return;
    setError("");
    setBusy("flashing");
    setSent(0);

    const wakeLock = await requestWakeLock();
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const target = await requestDfuDevice();
      append(`Connecting to ${describeDevice(target)}…`);
      server = await connect(target, { log: append });
      const result = await transferControllerFirmware(server, parsed.dat, parsed.bin, {
        executeFirmware: !dryRun(),
        log: append,
        // Only the firmware phase is worth a bar; the init packet is 142 bytes.
        onProgress: (progress) => {
          if (progress.phase === "firmware") setSent(progress.bytesSent);
        },
      });
      setOutcome(result.firmwareTransferred ? "sent" : "dry");
      append(
        result.firmwareTransferred
          ? "Transfer complete. The bike is restarting to install it."
          : "Dry run complete. Nothing was written; power-cycle the bike.",
      );
      // A practice run leaves the bike needing another power cycle and arm, so
      // send the reader back to that step rather than letting them retry here.
      if (!result.firmwareTransferred) setArmed(false);
    } catch (cause) {
      // The bike may have installed the image anyway: losing the reply to the
      // final execute looks identical to a failure from here.
      if (!dryRun()) setFlashFailed(true);
      setError(errorMessage(cause));
    } finally {
      wakeLock.release();
      safeDisconnect(server);
      setBusy(false);
    }
  };

  // Step 4 ────────────────────────────────────────────────────────────────
  const check = async (pick: boolean) => {
    const parsed = pkg();
    if (!parsed) return;
    setError("");
    setBusy("checking");
    setChecked(null);
    let server: BluetoothRemoteGATTServer | undefined;
    try {
      const target = pick ? await requestAppDevice() : device();
      if (!target) throw new Error("No bike selected.");
      setDevice(target);
      setNeedsPicker(false);
      server = await reconnect(target, append);
      const value = await readVersionInfo(server);
      setInfo(value);
      const expected = parsed.manifest.provides.controllerVersion;
      setChecked({ ok: value.controllerVersion === expected, reported: value.controllerVersion });
      append(`Controller reports ${value.controllerVersion}; expected ${expected}.`);
    } catch (cause) {
      if (!pick) setNeedsPicker(true);
      setError(errorMessage(cause));
    } finally {
      safeDisconnect(server);
      setBusy(false);
    }
  };

  /**
   * True when the bike already runs what this release installs.
   *
   * Observed on hardware: re-flashing then completes and the bike reboots, but
   * the display never shows its updating screen. Harmless, and worth saying
   * before the fact so it does not read as a failure.
   */
  const alreadyRunning = () => {
    const parsed = pkg();
    const value = info();
    return Boolean(
      parsed && value && value.controllerVersion === parsed.manifest.provides.controllerVersion,
    );
  };

  const percent = () => {
    const parsed = pkg();
    if (!parsed || parsed.bin.length === 0) return 0;
    return Math.min(100, Math.round((sent() / parsed.bin.length) * 100));
  };

  return (
    <div class="space-y-8">
      <Show when={!supported}>
        <Callout type="warning" title="This browser cannot talk to your bike">
          You need Chrome, Edge, or another Chromium browser, on desktop or Android. Safari and
          Firefox do not support Web Bluetooth, and Apple does not allow real Chrome on iPhones or
          iPads, so no iOS browser will work.
        </Callout>
      </Show>

      <Callout type="warning" title="Stock displays only, for now">
        This works on unmodified displays. If you have flashed custom display firmware, restore your
        backup with the{" "}
        <a href="/display" class="underline">
          display guide
        </a>{" "}
        before using this.
      </Callout>

      <Callout type="info" title="Before you start">
        This all happens over Bluetooth, and the bike only talks to one device at a time. Close the
        Super73 app and anything else paired with it. Keep the bike switched on and nearby.
      </Callout>

      {/* Step 1 */}
      <Step number={1} title="Read your bike" done={info() !== null}>
        <p class="mb-4 text-gray-600">
          Nothing is written. This tells us which firmware fits your bike, and checks that Bluetooth
          is working.
        </p>
        <Button onClick={read} disabled={!idle() || !supported}>
          {busy() === "reading" ? "Reading…" : info() ? "Read again" : "Connect to my bike"}
        </Button>

        <Show when={info()}>
          {(value) => (
            <>
              <dl class="mt-5 divide-y divide-gray-100 rounded-lg border border-gray-200">
                <For each={rows(value())}>
                  {([label, shown]) => (
                    <div class="grid gap-1 px-4 py-2 sm:grid-cols-2">
                      <dt class="text-sm text-gray-500">{label}</dt>
                      <dd class="font-mono text-sm break-all sm:text-right">{shown}</dd>
                    </div>
                  )}
                </For>
              </dl>
              <CopyButton text={report} label="Copy this for troubleshooting" />

              <h4 class="mt-6 font-semibold">Choose firmware</h4>
              <Show
                when={offers().length > 0}
                fallback={
                  <p class="mt-2 text-sm text-gray-600">
                    Nothing we publish lists your controller version as supported, so there is
                    nothing to install.
                  </p>
                }
              >
                <ul class="mt-3 space-y-3">
                  <For each={offers()}>
                    {(offer) => (
                      <li class="rounded-lg border border-gray-200 p-4">
                        <div class="flex flex-wrap items-baseline gap-2">
                          <span class="font-semibold">{offer.release.name}</span>
                          <span class="font-mono text-sm text-gray-500">
                            v{offer.release.version}
                          </span>
                          <a
                            href={`/firmware#${offer.release.id}`}
                            target="_blank"
                            rel="noopener"
                            class="text-sm text-blue-500 hover:underline"
                          >
                            details ↗
                          </a>
                        </div>
                        <p class="mt-1 text-sm text-gray-600">{offer.release.description}</p>
                        <div class="mt-3">
                          <Button
                            onClick={() => choose(offer.release)}
                            disabled={!idle()}
                            size="sm"
                            variant={selected()?.id === offer.release.id ? "primary" : "secondary"}
                          >
                            {selected()?.id === offer.release.id ? "Selected" : "Select"}
                          </Button>
                        </div>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>

              <details class="mt-4">
                <summary class="cursor-pointer text-sm text-gray-600 select-none hover:text-gray-800">
                  Use my own firmware file
                </summary>
                <p class="mt-2 text-sm text-gray-600">
                  For firmware you built yourself. We don't check whether it fits your bike.
                </p>
                <input
                  type="file"
                  accept=".zip"
                  disabled={!idle()}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) void upload(file);
                  }}
                  class="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700"
                />
                <Show when={uploaded()}>
                  <p class="mt-2 text-sm text-gray-700">Using {uploaded()}</p>
                </Show>
              </details>
            </>
          )}
        </Show>
      </Step>

      {/* Step 2 */}
      <Step number={2} title="Enter update mode" locked={!pkg()} done={armed()}>
        <p class="mb-4 text-gray-600">
          Switches your display into update mode, ready to receive the new firmware. Its screen will
          say <b>Updating Firmware</b> when it is ready for the next step.
        </p>
        <Show when={alreadyRunning()}>
          <div class="mb-4">
            <StatusMessage tone="info">
              Your bike already reports controller version {info()?.controllerVersion}, which is
              what this firmware installs. Sending it again is safe and will finish normally, but
              the display may not show its updating screen, because there is nothing new to program.
            </StatusMessage>
          </div>
        </Show>
        <Button onClick={() => arm(false)} disabled={!idle() || !pkg()}>
          {busy() === "arming" ? "Switching…" : "Enter update mode"}
        </Button>
        <Show when={needsPicker() && !armed()}>
          <span class="ml-3">
            <Button onClick={() => arm(true)} disabled={!idle()} variant="secondary" size="sm">
              Pick my bike again
            </Button>
          </span>
        </Show>
      </Step>

      {/* Step 3 */}
      <Step number={3} title="Send the firmware" locked={!armed()} done={outcome() !== "none"}>
        <p class="text-gray-600">
          When your bike's screen says <b>Updating Firmware</b>, start the transfer and pick the
          device named <b>DfuTarg</b> from the list. This takes a minute or two.
        </p>
        <Callout type="warning" title="Let it finish">
          Keep this tab open and in front, and leave the bike switched on. When the transfer
          finishes, the bike restarts and shows <b>Updating Bike</b> with a percentage while it
          installs. Wait for its normal screen to come back.
        </Callout>

        <label class="mt-4 flex items-start gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={dryRun()}
            disabled={!idle() || !armed()}
            onChange={(event) => setDryRun(event.currentTarget.checked)}
            class="mt-0.5 h-4 w-4 rounded border-gray-300"
          />
          <span>
            Practice run: go through the motions without writing firmware. Most people can leave
            this off.
          </span>
        </label>

        {/* Once a transfer lands there is nothing useful to press here, and a
            second send is the case that finishes without the bike doing
            anything, so the step reports what happened instead. */}
        <Show
          when={outcome() === "none"}
          fallback={
            <StatusMessage tone="success">
              {outcome() === "sent"
                ? "Firmware sent. Your bike is installing it now. Wait for its normal screen, then check it below."
                : "Practice run finished, and nothing was written. Power-cycle the bike, then enter update mode again to do it for real."}
            </StatusMessage>
          }
        >
          <div class="mt-4">
            <Button onClick={flash} disabled={!idle() || !armed()}>
              {busy() === "flashing"
                ? `Sending… ${percent()}%`
                : dryRun()
                  ? "Start the practice run"
                  : "Send the firmware"}
            </Button>
          </div>
        </Show>

        <Show when={busy() === "flashing"}>
          <div class="mt-4 h-3 overflow-hidden rounded-full bg-gray-100">
            <div
              class="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${percent()}%` }}
            />
          </div>
        </Show>

        <Show when={log().length > 0}>
          <LogPanel lines={log()} />
        </Show>
      </Step>

      {/* Step 4 */}
      <Step
        number={4}
        title="Check it worked"
        locked={outcome() !== "sent" && !flashFailed()}
        done={checked()?.ok === true}
      >
        <p class="mb-4 text-gray-600">
          Once your bike is back on its normal screen, reconnect and check it's running the firmware
          you picked. Your browser may ask you to choose the bike again.
        </p>
        <Button
          onClick={() => check(false)}
          disabled={!idle() || (outcome() !== "sent" && !flashFailed())}
        >
          {busy() === "checking" ? "Checking…" : "Check my bike"}
        </Button>
        <Show when={needsPicker() && (outcome() === "sent" || flashFailed())}>
          <span class="ml-3">
            <Button onClick={() => check(true)} disabled={!idle()} variant="secondary" size="sm">
              Pick my bike again
            </Button>
          </span>
        </Show>

        <Show when={checked()}>
          {(result) => (
            <StatusMessage tone={result().ok ? "success" : "warning"}>
              <Show
                when={result().ok}
                fallback={
                  <>
                    Your bike reports controller version {result().reported}, which is not what this
                    firmware installs. If it is still showing <b>Updating Bike</b>, wait for it to
                    finish and check again.
                  </>
                }
              >
                Done. Your bike is running controller version {result().reported}.
              </Show>
            </StatusMessage>
          )}
        </Show>
      </Step>

      <Show when={error()}>
        <StatusMessage tone="error" title="Something went wrong">
          {error()}
          <Show when={flashFailed()}>
            <p class="mt-2">
              If your bike restarted and showed <b>Updating Bike</b>, it may have installed the
              firmware anyway. Wait for its normal screen and check below before trying again.
            </p>
          </Show>
        </StatusMessage>
      </Show>
    </div>
  );
}

/**
 * The version table, dropping anything the bike did not report.
 *
 * Several of these are optional over Bluetooth, and Chrome blocks the serial
 * number outright. An empty row raises a question the reader cannot act on.
 */
function rows(info: ModuleVersionInfo): [label: string, value: string][] {
  const entries: [string, string | undefined][] = [
    ["Display model", info.model],
    ["Serial number", info.serialNumber],
    ["Display firmware", info.nrfVersion],
    ["Display software", info.softwareRevision],
    ["Hardware revision", info.hardwareRevision],
    ["Bootloader", String(info.nrfBootloaderVersion)],
    ["Firmware variant", String(info.firmwareVariant)],
    ["CAN bridge (STM)", String(info.stmVersion)],
    ["Motor controller", String(info.controllerVersion)],
    ["Controller variant", info.controllerVariant ? String(info.controllerVariant) : undefined],
    ["Battery", String(info.batteryVersion)],
  ];
  return entries.filter((entry): entry is [string, string] => Boolean(entry[1]));
}

interface StepProps {
  number: number;
  title: string;
  locked?: boolean;
  done?: boolean;
  children: JSX.Element;
}

/**
 * A step that cannot be used before the ones above it. Locked steps stay
 * visible and readable so people can see what is coming, but their controls
 * are inert.
 */
function Step(props: StepProps) {
  const state = () => (props.done ? "done" : props.locked ? "locked" : "active");

  return (
    <div class="relative">
      <div
        class={`absolute -top-3 -left-3 z-10 flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold shadow-md ${
          state() === "done"
            ? "bg-green-500 text-white"
            : state() === "locked"
              ? "bg-gray-300 text-white"
              : "bg-blue-500 text-white"
        }`}
      >
        {state() === "done" ? "✓" : props.number}
      </div>
      <div
        class={`rounded-lg border bg-white p-6 ${
          state() === "locked" ? "border-gray-200 opacity-60" : "border-gray-300"
        }`}
      >
        <h3 class="text-lg font-semibold">{props.title}</h3>
        <div class="mt-2">{props.children}</div>
      </div>
    </div>
  );
}
