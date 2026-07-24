# mc-farm

`mc-farm` reads bike firmware versions and updates the motor controller through
the display's BLE connection. It does not require custom display firmware or a
USB debug probe.

Bluetooth support currently depends on the host adapter supported by the
`webbluetooth` package.

## Read firmware versions

```bash
bun mc-farm read SUPER73
```

The BLE name is matched case-insensitively. A device ID may also be supplied.

## Validate the DFU path without sending firmware

Flash is a dry run by default:

```bash
bun apps/mc-farm/main.ts flash SUPER73 \
  --bin firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.patched.bin \
  --dat firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.dat
```

The dry run arms external storage, reboots the display into DFU mode, and
submits the unmodified signed `.dat` init packet. It stops before sending any
bytes from the `.bin`. Power-cycle the bike afterward to leave the test
session.

## Flash firmware

Add `--execute` to send and finalize the firmware:

```bash
bun apps/mc-farm/main.ts flash SUPER73 \
  --bin firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.patched.bin \
  --dat firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.dat \
  --execute
```

Both modes request interactive confirmation. Use `--yes` for an intentional
non-interactive run. Run with `--help` for transport tuning and timeout options.
