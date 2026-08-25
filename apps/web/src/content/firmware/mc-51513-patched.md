---
name: Motor Controller 5.15.13 Display-Speed and Field-Weakening Patch
version: "1.0.3"
target: controller
path: /cfw/mc-51513-patched-v1.0.3.zip
date: 2026-08-25
description: Experimental 5.15.13 controller configuration with display-driven speed control and high-speed field weakening
downloadOnly: true
experimental: true
---

## What this is

An experimental patch based on the FTEX 5.15.11 motor-controller firmware. It
uses the controller's normal configuration and speed-control paths, with baked
defaults that raise the throttle ceiling to 99 km/h and the vehicle ceiling to
75 km/h. The live `0x201C:0` value from the display remains authoritative below
that vehicle ceiling, while Mode 4 is effectively unlimited for this bike.

The baked speed-power minimum and maximum are both 100%, so the original motor
control code naturally holds the speed-dependent power percentage at 100%.

The baked motor electrical-speed limit is raised from 2500 to 3000, and the
controller's existing field-weakening loop is enabled. Field weakening responds
to voltage-vector utilization as motor back-EMF rises; it is not enabled by a
fixed road-speed threshold. Its stock tuning and -20 A d-axis-current bound are
otherwise unchanged. The controller continues to enforce its total current-vector
limit, so weakening current reduces the q-axis current available for torque.

The patch does not change the controller's executable code or the display's
separate throttle enable/inhibit command.

## Configuration replacement

Installing this version replaces the controller's persisted user configuration
once. The package and target-image versions advance to 5.15.13. The controller
accepts persisted configuration only when its version exactly equals the factory
configuration version, so this also replaces configuration installed by patch
v1.0.2 with version 5.15.12. On first boot, the controller installs the patched
baked defaults and writes a fresh configuration CRC.

Any settings previously installed through the controller's CANopen configuration
import are replaced by these defaults.

## Version reporting

The outer package header, target-image version, and MCUboot image header all
identify this image as 5.15.13. After installation, the controller publishes its
updated factory-configuration version through CANopen `0x2008:0`, which the
display exposes as controller version 51513 over BLE.

## Availability

This package is available as a direct download for hardware validation. It is
not offered automatically by the guided controller flasher.

## Changelog

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
