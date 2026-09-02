---
name: Mode 4 Unlock
path: /cfw/SUPER73-ZX-MCU-202-NEW-off-road-r203-v1.0.3.zip
anchor: mc-203-patched
date: 2026-09-01
description: Reduced high-speed current rolloff in mode 4
experimental: true
---

Requires setting the bike into mode 4 to activate full power.

## Features

- Keeps normal display-controlled operating-mode selection
- Retains the factory throttle response rates
- Disables field weakening at all vehicle speeds
- Bypasses speed-dependent current scaling in the primary assist path and the
  mode 4 throttle path

Once installed, the bike reports controller version 203.

## Compatibility

Built from the stock controller 202 image for the SUPER73 ZX, and applies to
bikes whose motor controller reports a 201 or 202 versions.

## Changelog

### v1.0.3

- Restored the factory throttle response rates to avoid excessive current ramp
  under full throttle
- Disabled field weakening to test its interaction with full-throttle current
  demand

### v1.0.2

- Corrected controller version 203 reporting over BLE while leaving the
  diagnostic SDO version unchanged

### v1.0.1

- Restored normal operating-mode selection from the display
- Added equal low- and high-speed throttle response rates to modes 3 and 7
- Bypassed speed-dependent current scaling for primary assist and mode 3/7
  throttle
- Restored the factory q-axis current-command filter

### v1.0.0

- Initial release
