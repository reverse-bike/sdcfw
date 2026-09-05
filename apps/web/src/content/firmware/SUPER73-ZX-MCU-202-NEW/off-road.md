---
name: Mode 4 Unlock
path: /cfw/SUPER73-ZX-MCU-202-NEW-off-road-r203-v1.0.8.zip
anchor: mc-203-patched
date: 2026-09-05
description: Reduced high-speed throttle current rolloff in mode 4
experimental: true
---

Requires setting the bike into mode 4 to activate full power.

## Features

- Keeps normal display-controlled operating-mode selection
- Retains the factory throttle response rates
- Raises the throttle speed-target multiplier from 9× to 12×, with signed-range saturation
- Uses factory throttle current scaling below 13 km/h and holds factor 200 at and above it
- Disables field weakening at all vehicle speeds

Once installed, the bike reports controller version 203.

## Compatibility

Built from the stock controller 202 image for the SUPER73 ZX, and applies to
bikes whose motor controller reports a 201 or 202 versions.

## Changelog

### v1.0.8

- Raised the held mode 3/7 throttle current factor from 173 to 200 and moved
  the cutoff to 13 km/h, where the stock table reaches 200. This avoids an upward
  step at the cutoff and raises the high-speed current ceiling by approximately 16%.
- Kept the 12× throttle speed target, factory response rates, and disabled
  field weakening unchanged. This experimental setting may reintroduce cutouts;
  revert to v1.0.7 if they return.

### v1.0.7

- Raised the shared throttle speed-target multiplier from 9× to 12×, including
  internal modes 3 and 7. Caps the target at 32,767 to prevent signed wraparound.
- Kept the v1.0.6 current factor of 173, factory throttle response rates, and
  disabled field weakening. This experiment raises requested speed at partial
  throttle too; it does not guarantee a 30 mph top speed.

### v1.0.6

- Moved the throttle current taper cutoff to 15 km/h, raising the held factor
  from 108 to 173. This experimental setting may reintroduce full-throttle cutouts.

### v1.0.5

- Held the mode 3/7 throttle current factor at 108 above 24 km/h instead of
  allowing it to taper toward 70
- Restored factory speed-dependent current scaling in the primary assist path

### v1.0.4

- Restored factory speed-dependent throttle current scaling to prevent
  full-throttle overcurrent cutouts

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
