---
name: Motor Controller 5.15.11 Display-Speed Patch
version: "1.0.0"
target: controller
path: /cfw/mc-51512-patched-v1.0.0.zip
date: 2026-08-24
description: Experimental 5.15.11 controller firmware with a display-driven throttle ceiling and no speed-power rolloff
downloadOnly: true
experimental: true
---

## What this is

An experimental patch for the FTEX 5.15.11 motor controller. The throttle path
uses the live speed ceiling received from the display instead of reducing it
against the controller's configured throttle and vehicle-context ceilings.
The speed-dependent motor-power curve is also held at 100% instead of rolling
power off as vehicle speed rises.

The patch does not change the pedal-assist speed path or the display's separate
throttle enable/inhibit command.

## Version reporting

The real package and MCUboot versions remain 5.15.11. Only the value published
through CANopen 0x2008:0 is changed, so the display reports controller version
51512 over BLE after a successful installation. Persisted configuration
validation continues using the stock factory version.

## Availability

This package is available as a direct download for hardware validation. It is
not offered automatically by the guided controller flasher.

## Changelog

### v1.0.0

- Make the display-driven 0x201C:0 value authoritative for throttle speed (unlimited in Mode 4)
- Hold the speed-dependent motor-power limit at 100%
- Report controller version 51512 through CAN and BLE for post-flash validation
