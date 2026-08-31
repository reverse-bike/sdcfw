---
name: Off-road
path: /cfw/230-BLUETOOTH-EXT1-310-off-road-r311-v1.0.0.zip
anchor: mc-311-patched
date: 2026-07-24
description: Patched motor-controller firmware with off-road mode and throttle tuning
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
reports a 3XX version. This is based on the US firmware.

## Changelog

### v1.0.0

- Initial release
