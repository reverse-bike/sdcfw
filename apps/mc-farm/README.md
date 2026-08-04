# mc-farm

`mc-farm` reads bike firmware versions and updates the motor controller through
the display's BLE connection. It does not require custom display firmware or a
USB debug probe.

Bluetooth support currently depends on the host adapter supported by the
`webbluetooth` package.

## Read firmware versions

```bash
bun mc-farm read
```

The command scans for manufacturer data identifier `0x020f`, then connects to
and prints information for every matching bike. Each result includes its
Device ID.

A Device ID can be supplied to read only that bike:

```bash
bun mc-farm read <device-id>
```

A Device ID is the identifier reported by the host Bluetooth stack. It may be
a Bluetooth address on some platforms, but macOS reports an opaque
CoreBluetooth UUID instead.

## Read DFU device information

By default, the command assumes DFU mode is already active and scans for the
advertised Nordic Secure DFU service (`FE59`):

```bash
bun mc-farm read-dfu
```

Use `--arm` to find a bike through manufacturer data `0x020f`, reboot it into
DFU mode, and then continue:

```bash
bun mc-farm read-dfu --arm
```

If either scan finds multiple devices, the command prints their Device IDs and
exits. Rerun with the intended ID:

```bash
bun mc-farm read-dfu <dfu-device-id>
bun mc-farm read-dfu <bike-device-id> --arm
```

No firmware data is sent. Power-cycle the bike afterward to leave DFU mode.

## Validate the DFU path without sending firmware

Flash accepts the archives produced by Kitchen's `--zip` option and verifies
their manifest and file hashes before connecting to a bike. It is a dry run by
default:

```bash
bun mc-farm flash --zip apps/web/public/cfw/mc-311-patched-v1.0.0.zip
```

Loose binary and init-packet files remain supported:

```bash
bun mc-farm flash \
  --bin firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.patched.bin \
  --dat firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.dat
```

Flash always starts in application mode and finds bikes through manufacturer
data `0x020f`. If multiple bikes match, it prints their Device IDs and exits
before confirmation or any write. Rerun with the intended ID as the first
argument.

The dry run arms external storage, reboots the display into DFU mode, and
submits the unmodified signed `.dat` init packet. It stops before sending any
bytes from the `.bin`. Power-cycle the bike afterward to leave the test
session.

## Flash firmware

Add `--execute` to send and finalize the firmware:

```bash
bun mc-farm flash <bike-device-id> \
  --zip apps/web/public/cfw/mc-311-patched-v1.0.0.zip \
  --execute
```

Display (`nrf`) archives are rejected because `mc-farm` only updates the motor
controller.

Both modes request interactive confirmation. Use `--yes` for an intentional
non-interactive run. Run with `--help` for transport tuning and timeout options.
