---
name: Motor Controller 5.15.14 Patched
version: "1.0.4"
target: controller
path: /cfw/mc-51514-patched-v1.0.4.zip
date: 2026-08-25
description: Removes the speed cap in mode 4 and improves power at higher speeds
downloadOnly: true
experimental: true
---

## Features

- Mode 4 has no speed cap
- Modes 1–3 keep their normal speed limits
- Maintains stronger motor power at higher speeds

## Compatibility

For bikes running motor-controller firmware 5.15.11. This experimental release
is available as a direct download and is not offered by the guided controller
flasher.

## Warning

- Applying this firmware will void your warranty.
- This firmware applies more power to the motor. It may break or overheat your bike and may wear parts out more quickly.
- This firmware may interfere with or not work with official and third-party phone apps.

## Changelog

### v1.0.4

- Keep the raised motor electrical-speed limit of 3000
- Restore field weakening to the stock disabled setting
- Raise all package and configuration version fields to 5.15.14 so bikes running v1.0.3 install the corrected defaults

### v1.0.3

- Raise all package and configuration version fields to 5.15.13
- Raise the motor electrical-speed limit from 2500 to 3000
- Enable the controller's existing field-weakening loop with its stock tuning and current bounds

### v1.0.2

- Use baked controller configuration instead of executable-code hooks
- Raise the configured throttle and vehicle speed ceilings
- Set the speed-power minimum and maximum to 100%
- Advance the package and target-image versions so the patched defaults are installed

### v1.0.1

- Identify the MCUboot image as 5.15.12 without changing the factory-configuration version

### v1.0.0

- Make the display-driven 0x201C:0 value authoritative for throttle speed (unlimited in Mode 4)
- Hold the speed-dependent motor-power limit at 100%
- Report controller version 51512 through CAN and BLE for post-flash validation
