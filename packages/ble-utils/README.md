# BLE utilities

Browser-compatible protocol code shared by `mc-farm` and the web app. It
operates on standard Web Bluetooth GATT objects and does not own device
selection, filesystem access, or a Node BLE implementation.

It provides:

- application authentication and module-version registry reads;
- controller-package parsing and both required CRC algorithms;
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
   image, waits ~8s while the display erases its external staging area, then
   requests a buttonless DFU reboot.
3. The display reboots and advertises as `DfuTarg` with the Nordic Secure DFU
   service (`FE59`). This is a **different device** from the application: it
   must be discovered and connected to again.
4. `transferControllerFirmware` sends the signed `.dat` init packet, then the
   `.bin` in objects, checkpointing as it goes, and executes.
5. The display programs the controller from external flash and reboots.

## Device behaviour worth knowing

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
- **`BluetoothDevice.id` is a per-origin salted hash,** not the address the CLI
  prints. It distinguishes devices within a session and nothing more.
