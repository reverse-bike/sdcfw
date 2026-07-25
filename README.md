# SUPER73 CUSTOM FIRMWARE

Go to the [custom firmware](https://cfw.reverse.bike/) site to start.

Motor-controller firmware is updated over BLE through the bike display, which
needs no cable and nothing taken apart. The older USB display-firmware tools
remain available for existing workflows.

## Layout

| Path                      | What it is                                           |
| :------------------------ | :--------------------------------------------------- |
| `apps/web`                | The site: guided flows and developer tools           |
| `apps/mc-farm`            | CLI for reading versions and flashing the controller |
| `apps/nrf-farm`           | Legacy USB CLI for display firmware                  |
| `apps/kitchen`            | Applies patches and publishes firmware archives      |
| `packages/ble-utils`      | BLE protocols and controller DFU, browser-compatible |
| `packages/usb-utils`      | USB/DAP display firmware operations                  |
| `packages/firmware-utils` | The published archive format, read and written       |
| `firmware/`               | Firmware dumps, patched images, and their notes      |

Each has a README covering what is specific to it. `packages/ble-utils` is
where the device's own behaviour is written down, which is the part that is
expensive to rediscover.

## Developers

```bash
bun mc-farm
bun nrf-farm
bun kitchen
bun web
bun web:build
bun web:preview
make test        # typecheck, lint, format, astro check, tests
```

Published firmware lives in `apps/web/public/cfw` and is produced only by
`kitchen patch --zip`. `make test` rebuilds every published archive from its
descriptor and fails if they no longer match, so an edited patch cannot quietly
diverge from firmware people already installed.

## License

AGPLv3
