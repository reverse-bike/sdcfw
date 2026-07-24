# nrf-farm

The legacy display-firmware CLI uses a CMSIS-DAP USB probe to inspect, back up,
erase, and restore the display's nRF52 firmware.

```bash
bun apps/nrf-farm/main.ts read_info
bun apps/nrf-farm/main.ts backup ./backup
bun apps/nrf-farm/main.ts erase
bun apps/nrf-farm/main.ts restore ./backup/flash.bin ./backup/uicr.bin
```

For new motor-controller firmware work, use `mc-farm` and BLE instead.
