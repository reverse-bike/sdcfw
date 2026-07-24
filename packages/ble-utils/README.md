# BLE utilities

Browser-compatible protocol code shared by `mc-farm` and the future web UI.
The package operates on standard Web Bluetooth GATT objects and does not own
device selection, filesystem access, or a Node BLE implementation.

It provides:

- application authentication and module-version registry reads;
- controller-package parsing and both required CRC algorithms;
- the F0CC external-controller update request;
- Nordic Secure DFU command and data-object transfer with safe resume checks;
- a dry-run boundary after the signed `.dat` init packet and before `.bin`
  bytes are sent.

Run its tests from the repository root:

```bash
bun test packages/ble-utils
```
