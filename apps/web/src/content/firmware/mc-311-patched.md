---
name: Motor Controller 310 Patched
version: "1.0.0"
target: controller
path: /cfw/mc-311-patched-v1.0.0.zip
date: 2026-07-24
description: Patched motor-controller firmware with off-road mode and throttle tuning
requires:
  controllerVersion:
    - 3XX
experimental: true
---

## Features

- Assist levels over 0 activate 'mode 3' (off-road). Bike will start in assist level 0 with mode 1.
- Throttle current-ceiling speed roll-off disabled in mode 3
- Faster throttle rise rate in mode 3, low and high speed alike
- Smoother q-axis current command filtering

Once installed your bike reports controller as version 311. The bike will start up in assist level 0 with the speed-limited mode 1. To switch into mode 3, use any other assist mode by pressing the up button on the bike's display.

## Compatibility

Built from the stock controller 310 image, and applies to any bike whose motor controller
reports a 3XX version.

## Warning

- Applying this firmware will void your warranty.
- This firmware applies significantly more power to the motor. It may break or overheat your bike. It may wear parts out more quickly.
- This firmware may interfere or not work with the official and 3rd party phone apps.

## Changelog

### v1.0.0

- Initial release
