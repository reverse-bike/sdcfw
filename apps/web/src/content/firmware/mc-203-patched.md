---
name: Motor Controller 203 Patched
version: "1.0.0"
target: controller
path: /cfw/mc-203-patched-v1.0.0.zip
date: 2026-08-10
description: Patched SUPER73 ZX motor-controller firmware with off-road mode and faster throttle response
compatibility:
  - SUPER73 ZX
requires:
  controllerVersion:
    - "203"
experimental: true
---

## Features

- Starts in mode 3 and ignores later operating-mode changes from the display
- Faster low- and high-speed throttle response
- Smoother q-axis current command filtering

Once installed, the bike reports controller version 203.

## Compatibility

Built from the stock controller 202 image for the SUPER73 ZX, and applies to
bikes whose motor controller reports a 2XX version.

## Warning

- Applying this firmware will void your warranty.
- This firmware may apply more power to the motor. It may break or overheat your bike and may wear parts out more quickly.
- This firmware may interfere with or not work with official and third-party phone apps.

## Changelog

### v1.0.0

- Initial release
