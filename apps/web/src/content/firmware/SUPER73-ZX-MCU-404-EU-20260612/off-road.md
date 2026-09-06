---
name: EU Unlock
path: /cfw/SUPER73-ZX-MCU-404-EU-20260612-off-road-r405-v1.0.1.zip
anchor: mc-405-patched
date: 2026-09-04
description: Removes the EU speed limits and opens up the current envelope
experimental: true
---

The EU 404 firmware pins the controller in its own internal mode 4 and caps
pedal assist at 24 km/h and throttle at 6 km/h. This release keeps that mode
and removes the caps. The display will keep showing Mode 1, because that is how
it labels the controller's internal mode 4. Ride behavior is what changes.

## Features

- Raises the pedal-assist speed limit from 24 km/h to 255 km/h
- Raises the throttle speed limit from 6 km/h to 255 km/h
- Stretches the speed-dependent current envelope to twice the speed, so the
  current available at 30 km/h matches what the factory image allows at 15 km/h
- Uses the full current envelope on the throttle instead of 85 percent
- Removes the throttle target-speed ceiling
- Disables field weakening at all vehicle speeds

Once installed, the bike reports controller version 405.

## Compatibility

Built from the stock EU controller 404 image for the SUPER73 ZX, and applies to
bikes whose motor controller reports version 404 or 405.

## Changelog

### v1.0.1

- Removed the 24 km/h pedal-assist and 6 km/h throttle speed limits
- Replaced the fixed maximum-current envelope with a speed-stretched envelope
  to avoid full-throttle overcurrent cutouts
- Used the full current envelope on the throttle instead of 85 percent

### v1.0.0

- Initial release
