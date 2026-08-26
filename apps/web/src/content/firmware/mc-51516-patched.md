---
name: Motor Controller 5.15.16 Patched
version: "1.0.6"
target: controller
path: /cfw/mc-51516-patched-v1.0.6.zip
date: 2026-08-25
description: Uncorks throttle and pedal-assist speed with field weakening disabled
downloadOnly: true
experimental: true
---

## Features

- Mode 4 follows the display-driven speed setting instead of the stock 20 mph ceiling
- Pedal-assist speed ceilings are raised to match the throttle ceiling
- Maintains stronger motor power at higher speeds
- Leaves field weakening disabled

## Compatibility

For bikes running motor-controller firmware 5.15.11 or an earlier release of
this patch. This experimental release is available as a direct download and is
not offered by the guided controller flasher.

## Warning

- Applying this firmware will void your warranty.
- This firmware applies more power to the motor. It may break or overheat your bike and may wear parts out more quickly.
- Test with the driven wheel safely raised before riding, and verify that releasing the throttle and applying either brake reliably stops motor drive.
- This firmware may interfere with or not work with official and third-party phone apps.

## Changelog

### v1.0.6

- Raise all four package and image version values to 5.15.16
- Keep all ten per-level PAS ceilings and the global PAS ceiling at 99 km/h
- Remove the field-weakening enable and polarity instruction patches, restoring the stock-disabled field-weakening path
- Keep the 3000 RPM motor-speed ceiling and 100% speed-power bounds

### v1.0.5

- Raise all four package and image version values to 5.15.15
- Raise all ten per-level PAS ceilings and the global PAS ceiling from 32 to 99 km/h
- Enable the controller's existing field-weakening loop and correct its configured current polarity
