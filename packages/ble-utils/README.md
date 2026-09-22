# BLE utilities

Browser-compatible protocol code shared by `mc-farm` and the web app. It
operates on standard Web Bluetooth GATT objects and does not own device
selection, filesystem access, or a Node BLE implementation.

It provides:

- application authentication and module-version registry reads;
- controller and bootloader init-packet parsing and both required CRC algorithms;
- the F0CC external-controller update request;
- Nordic Secure DFU command and data-object transfer with safe resume checks;
- a dry-run boundary after the signed `.dat` init packet and before `.bin`
  bytes are sent.

Run its tests from the repository root:

```bash
bun test packages/ble-utils
```

## How a controller update runs

1. Connect to the bike's application firmware, found by manufacturer data
   `0x020f`.
2. `armControllerUpdate` writes the F0CC packet carrying the CRC of the staged
   image, then allows 8s for external staging preparation before requesting a
   buttonless DFU reboot. This wait does not
   confirm that preparation succeeded.
3. The display reboots and advertises as `DfuTarg` with the Nordic Secure DFU
   service (`FE59`). This is a **different device** from the application: it
   must be discovered and connected to again.
4. `transferControllerFirmware` sends the signed `.dat` init packet, then the
   `.bin` in objects, checkpointing as it goes, and executes.
5. The display programs the controller from external flash and reboots.

Transfers default to 20-byte writes. In the analyzed NRFBL-6
`comodule_nrf_bl_secure.bin`, the BLE configuration at file offset `0x3298`
sets ATT MTU to 23, the exchange reply at `0x3270` also supplies 23, and the
DFU packet characteristic initializer at `0x3b00` sets maximum length to 20.
The data-object handler at `0x4cd0` additionally rejects writes over 128 bytes.
Larger browser writes therefore cannot speed up this bootloader. These limits
have not been verified for every bootloader version.

NRFBL-8 `comodule_nrf_bl_secure.bin` supports larger writes: BLE configuration
at file offset `0x3344` and the MTU exchange reply in `0x31c4` use 247,
the packet initializer at `0x3c2c` sets maximum length to 244, and the data
handler at `0x52a8` accepts up to 512 bytes with 512-byte receive buffers.
The guided controller uploader selects 244-byte writes for reported bootloader
version 8 only; other versions retain 20. The browser/OS must also negotiate
the larger MTU. The advanced transfer tool and CLI allow an explicit chunk size.

Explicitly configured larger writes fall back to 100, 58, then 20 bytes if
the write rejects. Silent truncation or rejection inside the bootloader does
not trigger that fallback; object offset and CRC verification must still pass
before execution.

NRFBL-8 has a separate external-staging CRC check at file offset `0x8d74`.
It compares the header CRC with a word-reversed MPEG-2 CRC over `0x7000`
payload bytes (`0x3404`), marking the header invalid on mismatch. For the
external-file target `0x80`, finalization at `0x5cd0` can nevertheless return
DFU success. In display firmware 250426, validation at `0x31fca` reads that
header, and controller programming at `0x329e8` requires its valid type `0xf0`.
Thus successful transport CRC and execute responses do not prove that a
controller image was accepted for installation; verify the controller version
after reboot.

## Internal nRF bootloader updates

The Bluetooth tool at `/display/advanced/` accepts an original Nordic
bootloader-only ZIP (`manifest.bootloader`) or its `.bin`/`.dat` pair. It checks
image type, bootloader size, hardware/SoftDevice requirements, signature format,
and SHA-256. These are package checks, not proof of compatibility or authenticity;
the bike verifies the signature during init-packet execution.

Start from a normal application boot after a power cycle. Call `enterDfuMode`
directly: **do not send F0CC or call `armControllerUpdate`**. Internal nRF updates
must not select the external controller staging path. After selecting the DFU
device, use `transferDfuFirmware`, the same transport used by the controller
wrapper. It defaults to an init-only dry run; actual firmware requires
`executeFirmware: true`. A dry run can change DFU state but sends no image data.

The tool requires a successful dry run and explicit confirmation before sending
the bootloader. Keep power on through installation, then reconnect to the same
bike and read its runtime bootloader version. The signed firmware-version field
is not necessarily that reported version (the NRFBL-6 package declares 5).
Transfer completion alone does not verify installation. Bootloader-update
failure can require a wired probe for recovery.

## Controller behaviour worth knowing

**Buttonless DFU needs indications enabled first.** Nordic's service refuses a
control-point write with "CCCD improperly configured" unless the client has
subscribed to `8ec90003`. Without it the display silently ignores the reboot
request. `enterDfuMode` subscribes, writes, and decodes the response
indication. This cost a debugging session: the CLI happened to work without it
while the browser did not.

**A failed or stalled transfer is safe.** Data lands in the display's external
staging area, and the controller refuses to program anything whose CRC does not
match the one supplied in the F0CC packet. Recovery is power-cycle, re-arm,
retry. The sensitive window is the display programming the controller after the
final execute, which is when power should not be cut.

**Transfers resume.** The bootloader reports how far it got; if the CRC of the
local prefix matches, only the remainder is sent. Re-running a failed transfer
is the supported recovery, not a workaround.

**Re-flashing what is already installed appears to do nothing.** The transfer
completes and the bike reboots, but the display never shows its updating
screen. Harmless, and worth saying before the fact so it does not read as a
failure.

**Controller versions carry meaning in the leading digit,** so only the last
two digits are ours: 99 usable values. A release may therefore reuse a version,
and reading one back proves "an image reporting this version is running", not
"exactly this build is installed".

## Browser limits

- **Every chooser needs a fresh user gesture,** and the bootloader is a
  different device from the application, so a full update involves at least two
  device pickers. A device already chosen can be reconnected without a new
  gesture for the life of the page.
- **Background tabs break transfers.** Chrome clamps timers to ~1s when hidden,
  which stretches the inter-chunk sleeps far enough to blow the DFU checkpoint
  timeouts; mobile suspends the page outright. A screen wake lock does not
  prevent this, and is released when the page is hidden. Telling people to keep
  the tab in front is the real mitigation.
- **Chromium and HTTPS only.** Safari and Firefox have no Web Bluetooth, and no
  iOS browser will work.
- **Chrome hides the serial number.** Its GATT blocklist blocks characteristic
  `0x2A25` as a stable identifier, so `serialNumber` is always absent over Web
  Bluetooth though the CLI reads it. The blocklist also blocks Nordic's _legacy_
  DFU service (`00001530-…`), but not the Secure DFU service this code uses.
- **A timed-out `gatt.connect()` is still running.** Chrome has no connect
  timeout of its own on macOS, and calling `connect()` again while the first is
  pending fails with "Connection already in progress". `connect` calls
  `disconnect()` after a timed-out attempt, which cancels the pending connect,
  before it retries.
- **`BluetoothDevice.id` is a per-origin salted hash,** not the address the CLI
  prints. It distinguishes devices within a session and nothing more.
