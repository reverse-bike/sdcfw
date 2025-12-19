This project is an end-to-end pipeline to develop custom firmware for ebikes.

# Structure

## Apps
Apps, in `/apps` are for users. They are runnable or deployable.

- Farm: This is a CLI for interacting with physical devices. Backup, erase, restore firmware.
- Kitchen: This is a CLI for taking dumped firmware and creating custom firmware.
- Site: This is a deployable website for end users. Similar to Farm, but for the web.
- Server: This is server code for users to backup their firmware dumps in case they need to restore later.

## Packages
Packages, in `/packages`, are shared code for other packages and apps to depend on.

- Core: The main package. Any types or functionality that needs to be shared between apps goes here. Needs to be web and server compatible.
- DapJs: This is a vendored version of the public `dapjs` library for interacting the DAPLink dongles. Do not modify.

## Firmware
Firmware, in `/firmware`, is a data folder that holds raw firmware dumps and 'cleaned' (by Kitchen) dumps.

It contains firmware for several different MCUs, with folders for different found versions. `nrf` is a N52832, `stm` is a stm32f042f6, `mc` is for the motor controller and the MCU is currently unknown.

Folders may contain README.md's with extra information. Read them when working on those directories or devices.

# Notes

## Runtime

Default to using Bun instead of Node.js. This project uses strict TypeScript exclusively.

## Testing
Use `bun run typecheck` to run tsc on the whole repo.
Use `bun test` to run tests. (there are no tests yet.)

```ts#index.test.ts
import { test, expect } from "bun:test";

test("hello world", () => {
  expect(1).toBe(1);
});
```
