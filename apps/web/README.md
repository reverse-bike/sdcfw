# SuperDuper CFW Site

The end-user interface for reflashing an ebike. Two devices can be changed, and
they are separate jobs:

- **Motor controller**, over Bluetooth. No cable, nothing to open. This is the
  path most people want.
- **Display**, over USB with a debug probe wired to test points inside the case.
  Supports backing up the original firmware first.

Chromium only, on desktop or Android. Web Bluetooth and WebUSB do not exist in
Safari or Firefox, and no iOS browser will work.

## Architecture

An Astro static multi-page site, with SolidJS islands for the interactive
parts. Device protocols live in `@sdcfw/ble-utils` and `@sdcfw/usb-utils`;
archive reading lives in `@sdcfw/firmware-utils`. This app owns device
selection, the flow, and the copy.

```text
/                       choose a device
  /firmware             every published release, and what each changes
  /controller           guided controller flash
    /controller/advanced  individual operations, for development
  /display              guided display flash
    /display/advanced     individual tools, for development
```

`layouts/Page.astro` gives every page the same shell; `Button`, `ToolCard`,
`StatusMessage`, `LogPanel` and `CopyButton` back the tools, so a new one
inherits the established look rather than restating it.

## The guided controller flow

Four steps that must happen in order, each inert until the ones above it are
done: read the bike, prepare the update, send the firmware, check it worked.

Two things drive the shape:

- **Each chooser needs a fresh user gesture**, and the bootloader advertises as
  a different device than the application, so the bike gets picked more than
  once. Steps reuse an already-chosen device where they can, and offer the
  picker again when reconnection fails.
- **Arming stages one specific image** on the display and leaves the bike in its
  bootloader until the transfer lands. Choosing different firmware therefore
  resets the armed state, and closing the tab in that window trips the browser's
  unsaved-changes prompt.

The steps name what the bike's own screen shows, _Updating Firmware_ while it
waits for the transfer and _Updating Bike_ while it installs, because that is
how someone knows when to act.

## Where firmware metadata lives

Split deliberately, and worth preserving:

- **The archive** holds facts about itself that can never change: file hashes,
  the version the image reports, what device it is for.
- **The content collection** (`src/content/firmware/`) holds everything we might
  learn later: description, changelog, and which bikes a release may be flashed
  onto. Compatibility lives here precisely so it can widen without re-cutting
  and re-hashing an archive.

Compatibility is expressed as version patterns where `X` matches any digit, so
`3XX` covers 300–399. It has to accept the stock version, the versions our own
releases report, and re-flashing a version the bike already runs.

The guided flow offers only releases that match what the bike reported, and a
mismatch blocks rather than warns: controller firmware cannot be read back, so a
wrong image is not something a user can undo. People who bring their own archive
get integrity checking but no applicability gating.

## Commands

Run from this folder:

| Command         | Action                         |
| :-------------- | :----------------------------- |
| `bun dev`       | Dev server at `localhost:4321` |
| `bun build`     | Build to `./dist/`             |
| `bun preview`   | Preview the build              |
| `bun astro ...` | Astro CLI, e.g. `astro check`  |

From the repository root, `bun web`, `bun web:build`, `bun web:preview` and
`bun web:check` do the same. `make test` runs `astro check` along with the
typecheck, lint, format and test suites; it catches type errors inside `.astro`
files that `tsc` never looks at.
