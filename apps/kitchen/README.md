# Kitchen

Kitchen validates pristine firmware images and applies version-specific binary
patches. It refuses to patch an unknown or already-modified motor-controller
image.

## Patch the supported motor controller

From the repository root:

```bash
bun apps/kitchen/main.ts patch \
  apps/kitchen/patches/mc-230-bluetooth-ext1-310.ts
```

This reads:

```text
firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin
```

and writes:

```text
firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.patched.bin
```

The original `.dat` file remains unchanged and is used with the patched binary
by `mc-farm`.

## Display firmware

The older nRF display patches remain available:

```bash
bun apps/kitchen/main.ts patch apps/kitchen/patches/nrf-6-221122-0.ts
```

Run `bun apps/kitchen/main.ts` to see all Kitchen commands.
