---
name: Motor Controller 310 Stock
version: "1.0.0"
target: controller
path: /cfw/mc-310-stock-v1.0.0.zip
date: 2026-07-24
description: The unmodified factory motor-controller firmware, for going back to stock
stock: true
requires:
  controllerVersion:
    - 3XX
---

## What this is

The factory 310 image exactly as shipped, packaged so the same tools can flash
it. Nothing about it is modified.

## When to use it

Flash this to undo a custom release and return the controller to factory
behaviour. It appears in the guide's firmware list alongside custom releases.

Controller firmware cannot be read off the bike, so this is the factory image
rather than a backup of your own bike. It restores you to stock only if your
bike started on a version it replaces.

## Changelog

### v1.0.0

- Initial packaging of the stock image
