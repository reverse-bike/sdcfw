# Spec for the Motor Controller Web Flash Tool

This expands the final paragraph of `SPEC2.md`, which deferred the web app work.
The BLE package, the `mc-farm` CLI, and Kitchen's controller patch are done; this
covers bringing the same capability to the browser over Web Bluetooth.

Current state: `apps/web/src/pages/mc-farm.astro` is an unlinked prototype page
with two working tools, a version-info reader and a two-step "enter DFU mode"
tool. Both are proven against real hardware.

## Reference: what the CLI does

`apps/mc-farm/main.ts` (`flash`) runs this sequence:

1. Load `.bin` and `.dat`, parse the init packet, check `appSize` against the
   binary length and that the firmware class is EXT1 (`0x80`).
2. Scan for the manufacturer ID, select a bike, confirm with the operator.
3. Connect and call `armControllerUpdate` — writes the F0CC packet carrying the
   image CRC, waits ~8s for the external staging area to erase, then requests a
   buttonless DFU reboot.
4. Disconnect, wait 5s, scan for the Nordic DFU service, connect.
5. Call `transferControllerFirmware` — sends the signed init packet, then the
   firmware data objects with periodic checkpoints, then executes.
6. The display application programs the controller from external flash.

The web tool performs the same sequence. Everything device-facing already lives
in `packages/ble-utils`.

## Web constraints that shape the design

- **Two user gestures are mandatory.** `navigator.bluetooth.requestDevice()`
  requires a user activation, and the bootloader advertises as a different
  device (`DfuTarg`) than the application. The bike must therefore be picked
  from the chooser twice: once before arming, once after the reboot. This is the
  shape the existing DFU tool already uses.
- **Background tabs break transfers.** Chrome clamps `setTimeout` to ~1s in
  hidden tabs. The transfer's 30ms inter-chunk sleeps would stretch a ~90 second
  flash into tens of minutes and blow the checkpoint timeouts. On mobile,
  backgrounding suspends the page and drops the link. The tool must hold a
  screen wake lock during the transfer and warn on `visibilitychange`.
- **Chromium only, HTTPS only.** Safari and Firefox have no Web Bluetooth. iOS
  needs a third-party browser. Detect and explain rather than failing obscurely.
- **Device IDs are opaque.** `BluetoothDevice.id` is a per-origin salted hash,
  not the address the CLI prints. Logs use it only to distinguish devices within
  a session.
- **Buttonless DFU needs indications enabled** on `8ec90003` before the control
  point write, or the display silently ignores the request. Handled in
  `enterDfuMode`; noted here because it is easy to regress.

## Safety model

- **There is no read-back, but there is a way home.** Controller firmware cannot
  be read off the bike, so a per-bike backup like the display flow's is
  impossible. Instead, the stock image is published as an archive of its own and
  flashes by exactly the same path, so a bike that started on a published stock
  version can be put back on it. Recovery is therefore conditional: it depends
  on the bike having started from a version we ship, which the read step in the
  guided flow establishes before anything is armed. Users acknowledge that
  condition explicitly, and it is what they are told when they ask "can I undo
  this".
- **A failed or stalled transfer is safe.** Data lands in the display's external
  staging flash, and the controller refuses to program unless its own CRC check
  matches the CRC we supplied in the F0CC arm packet. An interrupted transfer
  means: power-cycle, re-arm, retry. The UI should say this plainly — it is the
  difference between a tool people trust and one they abandon halfway.
- **Leaving DFU mode is a power cycle.** No firmware is at risk in the meantime.
- The one genuinely sensitive window is the display programming the controller
  after the final execute. Users are told not to power off during it.

## Guided flow

The guided path is for end users and makes no decisions the tool can make
itself.

1. **Browser check.** Confirm Web Bluetooth exists; otherwise explain why and
   stop.
2. **Connect and read.** Pick the bike, read version info, and show it. This is
   the safe rehearsal: it exercises the chooser, the connection, and
   authentication without touching DFU, so a user who cannot get this far never
   proceeds to a flash. Reuses the existing read tool.
3. **Choose firmware,** filtered to entries compatible with what step 2 read.
4. **Preflight gate.** Two independent checks. Integrity: the archive's file
   hashes match its manifest. Applicability: the bike's `controllerVariant`,
   `controllerVersion`, and `firmwareVariant` satisfy the compatibility declared
   by the _content entry_ (not the archive — see Firmware packaging). A mismatch
   blocks, it does not warn. This is the biggest safety improvement over the
   CLI, which only validates the package against itself. Also validate
   `appSize` and the EXT1 class as the CLI does.
5. **Acknowledge and arm** (gesture 1). Explain the no-backup and
   don't-power-off points, then `armControllerUpdate`: F0CC, erase wait,
   buttonless reboot.
6. **Connect and flash** (gesture 2). Pick the DFU target, then
   `transferControllerFirmware` with `executeFirmware: true`, showing a progress
   bar and elapsed/remaining time. Wake lock held for the duration.
7. **Wait and power-cycle.** The display programs the controller. Tell the user
   not to cut power, then to power-cycle.
8. **Verify.** Reconnect, read version info again, and check the reported
   controller version against the archive's `provides.controllerVersion`. The
   current patch reports 311 where stock reports 310.

   The version number is the only success signal the controller exposes, and it
   is a constrained one: the leading digit carries behaviour, so only the last
   two digits are ours, giving 99 usable values. Releases therefore may not bump
   it for minor changes, and several archives can legitimately report the same
   number. Verification consequently proves "a patched image reporting this
   version is running", not "exactly this archive is installed".

Failure at any point after step 5 offers "Reconnect and resume", which re-picks
the DFU target and calls `transferControllerFirmware` again with the same
package. The transfer already resumes from the device's reported offset when the
CRC prefix matches, so this is mostly UI work. The selected firmware ID is kept
in `sessionStorage` so a page reload can re-fetch the package and offer to
resume; uploaded files cannot survive a reload and the tool should say so.

No dry run in the guided flow. Step 2 is the connectivity rehearsal, the data
phase is resumable, and an extra "nothing happened" step mostly confuses.

## Advanced tools

For the advanced page, exposed as separate tools rather than a wizard:

- Read version info (exists).
- Enter DFU mode and inspect the bootloader (exists).
- Transfer a package, with a local `.bin`/`.dat` file picker, a dry-run toggle
  matching the CLI default, and `chunk` / `object-size` / `prn` inputs validated
  through `validateDfuTransportOptions`.
- Verify: read info and diff against a chosen firmware's expected values.
- Restore to stock: the same flash flow pointed at a stock archive. Worth
  presenting as its own entry point rather than burying it in the firmware list,
  since a user looking for it is usually having a bad day.

The file picker is what makes Kitchen output testable before it is published to
the site.

## Firmware packaging

`apps/web/public/cfw/` is a small "GitHub releases" area inside the repo:
self-contained, versioned archives that git tracks cheaply because they are
small and never change. Fixing anything means cutting a new version under a new
filename; archives are immutable.

The governing rule for where metadata goes:

> The archive holds facts about itself that can never change. The content
> collection holds everything we might learn later.

### Archive format

A controller package is a zip holding the firmware pair and a single manifest:

```text
mc-311-patched-v1.0.0.zip
├── sdcfw.json
├── GD_S73Rx_H104_S310US_20221020.patched.bin
└── GD_S73Rx_H104_S310US_20221020.dat
```

```json
{
  "schema": 1,
  "version": "1.0.0",
  "target": "controller",
  "files": {
    "bin": { "name": "GD_S73Rx_H104_S310US_20221020.patched.bin", "sha256": "…" },
    "dat": { "name": "GD_S73Rx_H104_S310US_20221020.dat", "sha256": "…" }
  },
  "source": { "name": "GD_S73Rx_H104_S310US_20221020.bin", "sha256": "…" },
  "provides": { "controllerVersion": 311 }
}
```

- `sha256` is lowercase hex over the raw file bytes, so it is checkable with
  `shasum -a 256` and with `crypto.subtle.digest` in the browser.
- File sizes and an image CRC are deliberately absent: the hash subsumes both,
  and the arm CRC is computed from the same bytes at flash time.
- `appSize` and the EXT1 firmware class are absent for the same reason — they
  are parsed from the `.dat` and validated at runtime.
- `schema` makes a future format change fail loudly rather than misparse.
- `version` is the archive's own release version. Together with `target` and
  `provides`, it lets an orphaned download identify itself in the UI and in
  logs with no content entry present. There is deliberately no slug or id: the
  filename is composed from these fields, never parsed back into them.
- `target` distinguishes controller packages from display archives, so
  uploading the wrong one produces a clear error.
- `source` records the stock image the release was patched from, by name and
  hash, so a rebuild is provably identical. Kitchen already knows both from the
  patch file's `firmwarePath` and `expectedSha256`, so this costs no new
  bookkeeping.
- `provides.controllerVersion` is the version this image reports over BLE once
  running. It belongs in the archive because it is fixed for these exact bytes,
  and it is the only real post-flash success signal we have. It is namespaced
  under `provides` to keep it clearly distinct from `version`, the archive's own
  release version. Display archives declare `provides.nrfVersion` instead, as a
  string, since the display exposes it through the Device Information Service
  and patching cannot safely change it.
- Nordic's `manifest.json` is **not** included. Nothing outside our own tooling
  can flash these packages — the controller is programmed by the display over a
  hybrid external-flash path — so an nrfutil-compatible manifest would be a dead
  file.
- No compatibility data lives in the archive. See below.

Display archives use the same manifest with `target: "nrf"` and the roles
`flash` and `uicr`, keeping the established `flash.bin` / `uicr.bin` filenames.
Those names cannot change: the restore tool reads them, and every backup a user
has ever downloaded uses them. `provides` is controller-only for now, so the
manifest is itself a small union on `target`. Adding `sdcfw.json` to a display
archive is backward compatible, since the restore tool looks up entries by name
and ignores anything else.

### Content collection

`apps/web/src/content/firmware/` keeps everything that may change after
release:

- Presentation: name, version, date, description, changelog, `experimental`,
  and `path` to the archive.
- `target: "display" | "controller"` so each flow filters its own list.
- Compatibility: which `controllerVariant` and `controllerVersion` values the
  release applies to. This lives here precisely because we expect to learn that
  more setups work without wanting to re-cut and re-hash an archive.

  Expect this to be looser than an exact list. A pattern or range such as `3XX`
  is likely the right shape, because the accepted set has to cover the stock
  version, the versions our own releases report, and any version that only
  differs in the two trailing digits. Re-flashing a bike that already reports
  the same version as the archive is explicitly allowed — it is safe, and the
  gate must not treat it as a downgrade or a no-op.

Users who bring their own archives to the advanced tools get integrity checking
but no applicability gating; compatibility is their responsibility.

### Producing archives

Patching an nRF dump and patching a controller image have diverged enough that
the descriptor becomes a discriminated union — `NrfPatchFile | McPatchFile` on a
`target` field — rather than one shape with fields that only apply half the
time. Controller descriptors also require `expectedSize` and `expectedSha256`,
and `target` feeds the archive manifest directly.

Both targets share a shape: a primary image that gets patched, plus one
companion file that ships alongside it unmodified. The companion is declared in
the descriptor rather than passed at the command line — `datPath` for the
controller's init packet, `uicrPath` for the nRF's UICR dump. Today every
controller release ships the same `.dat`, but that will not necessarily stay
true.

The command becomes `kitchen patch <descriptor> [--bin <out-dir>]
[--zip <out-dir>]`. Both are optional output directories defaulting to the
source firmware directory, and Kitchen owns the filenames: `<basename>.bin` when
the descriptor has no patches, `<basename>.patched.bin` when it does, and the
composed name below for archives. `--zip` works for both targets and requires
a `release` block. Kitchen is the only thing that produces release archives, so
hashes are never hand-maintained. A content entry stub is printed for pasting.

Archives may be overwritten in place; git holds the previous bytes, which is
guard enough.

### Stock archives

The pristine image is a release too. `firmware/mc/230-BLUETOOTH-EXT1-310/
GD_S73Rx_H104_S310US_20221020.bin` flashes by the same path and is what makes
"go back to stock" possible, so it is packaged and published exactly like a
patched release — declaring `controllerVersion: 310`, which Kitchen names
`mc-310-stock-v1.0.0.zip`.

That means a release descriptor is not necessarily a _patch_: a stock release is
a controller descriptor with an empty `patches` array and a `release` block.
Kitchen verifies `expectedSha256` as usual, applies nothing, and packages the
result. No new command and no second descriptor format.

Everything Kitchen needs beyond the existing fields goes in one optional block
on the patch file:

```ts
release: {
  version: "1.0.0",
  controllerVersion: 311,   // nrfVersion: "221122" on a display descriptor
},
```

- `version` is the archive's release version, and the reported firmware version
  is declared per target. The dividing line: a patch file's `name` identifies
  the firmware it was derived _from_; everything in `release` describes what
  comes _out_.
- **Kitchen composes the archive filename** and nothing ever parses it back:

  ```text
  <target>-<reported version>-<patched|stock>-v<version>.zip
  ```

  giving `mc-311-patched-v1.0.0.zip`, `mc-310-stock-v1.0.0.zip`, and
  `nrf-221122-patched-v1.0.0.zip` — which is exactly what the existing display
  archive is already called, so it needs no rename. `patched` versus `stock`
  comes from whether the descriptor has any patches, the same rule that names
  the loose `.bin`. The name exists for humans and for linking; identity for
  machines comes from the manifest fields.

- The block is absent on patches not intended for release, and `--zip` fails
  with a clear error when it is missing.
- `source` name and hash still come from the existing `firmwarePath` and
  `expectedSha256`.

These are declared values, deliberately _not_ derived from or cross-checked
against the byte patches. Patch descriptors are difficult enough to get right,
and coupling the manifest to their contents would make them harder to write and
review for no real safety gain. Keeping `controllerVersion` honest is a manual
responsibility of whoever writes the patch, like the patch descriptions
themselves.

A `make test` validator walks `public/cfw/`: every archive parses, its hashes
match its contents, and every content entry's `path` resolves to an archive
whose `version` agrees with the frontmatter. Compatibility is not cross-checked,
since it exists only in content.

Stronger, and worth having: re-run each release descriptor's pipeline and
compare the result against the published archive's entries. That catches an
edited patch descriptor silently diverging from firmware users have already
installed. The existing `nrf-221122-patched-v1.0.0.zip` passes this today — its
`flash.bin` is byte-identical to `firmware/nrf/6-221122-0/flash.patched.bin` and
its `uicr.bin` to the pristine dump.

The comparison is per-entry, not over archive bytes. The published display
archive was built with Finder's Compress and contains `__MACOSX/._*`
AppleDouble entries, so it cannot be reproduced byte-for-byte and should not be.
Re-cutting it with `--zip` once available yields identical firmware without the
junk and with a manifest; the shipped bytes users flash do not change. Archive
writing should pin mtimes and compression level so that regenerating a release
is otherwise deterministic.

### A note on the `.dat` payload hash

For patched controller images the `.dat` payload hash deliberately does not
match the `.bin`; the CLI prints this as expected. The web UI should not
surface it at all. Integrity against the archive is established by `sdcfw.json`,
and the controller refuses to program unless its own CRC check matches the CRC
supplied in the F0CC arm packet.

## Required `ble-utils` additions

Both are needed before the UI can be built properly:

- **`onProgress`** on `FirmwareTransferOptions`, threaded into
  `DfuClient.stream()`, which already tracks `baseOffset + offset`. Today the
  only output is a `log` callback, which suits a CLI and cannot drive a progress
  bar. Suggested payload: `{ phase: "init" | "firmware", bytesSent, totalBytes }`.
  Images are capped at `STAGED_CRC_LEN` (28 KB), so a full transfer is roughly
  60–120 seconds including the checkpoint pauses.
- **`AbortSignal`** support so a Cancel button can stop cleanly between chunks.
  Cancelling is safe at any point before the final execute.

## Site structure

`SPEC2.md` calls for demoting the USB display method in favour of BLE:

- `/` becomes the guided controller flow.
- The current USB tutorial moves to its own page, framed as the legacy method
  for the display module, still linked.
- `/advanced` grows a BLE section alongside the existing USB tools.
- User-facing copy never says "mc-farm".

Because the flow spans two connections and two gestures, the guided steps should
share a single session store (phase, chosen firmware, progress, log, error)
rather than prop-drilling signals the way `AdvancedTools` does today.

## Open questions

- Exact wording and placement of the no-backup acknowledgement.
- Whether the guided flow should require a successful read (step 2) before
  allowing a flash, or merely encourage it.
- Whether to keep the raw log panel visible in the guided flow or collapse it
  behind a "details" toggle, with a copy/download button for support.
