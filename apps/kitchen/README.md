# Kitchen

Kitchen validates pristine firmware images, applies version-specific binary
patches, and packages the result as a published release. It refuses to patch an
unknown or already-modified image.

## Patching

From the repository root:

```bash
bun kitchen patch apps/kitchen/patches/230-BLUETOOTH-EXT1-310/off-road.ts
```

This reads
`firmware/mc/230-BLUETOOTH-EXT1-310/GD_S73Rx_H104_S310US_20221020.bin` and
writes `…_20221020.patched.bin` beside it. Display patches work the same way:

```bash
bun kitchen patch apps/kitchen/patches/6-221122-0/unlocked.ts
```

Both outputs go to the source firmware directory unless `--bin <dir>` says
otherwise. Kitchen owns output names: `<basename>.patched.bin` when a
descriptor has patches, `<basename>.bin` when it has none.

## Publishing an archive

```bash
bun kitchen patch apps/kitchen/patches/230-BLUETOOTH-EXT1-310/off-road.ts \
  --zip apps/web/public/cfw
```

`--zip` writes a firmware archive (see `@sdcfw/firmware-utils` for the format)
and prints a content-entry stub to paste into
`apps/web/src/content/firmware/`. Passing only `--zip` writes no loose binary,
which is what lets a stock descriptor run at all.

Kitchen composes the archive filename from the target, the version the image
reports, whether it was patched, and the release version:
`mc-311-patched-v1.0.0.zip`. Nothing parses that name back; it is for humans and
for linking.

Kitchen is the only thing that produces archives, so hashes are never
hand-maintained. Archives may be overwritten in place, since git holds the
previous bytes.

## Patch descriptors

`patches/types.ts` defines `NrfPatchFile | McPatchFile`, a union on `target`, so
fields that only apply to one device cannot be set on the other. Both share a
shape: a primary image that gets patched, plus one companion file that ships
beside it unmodified: `datPath` for the controller's DFU init packet,
`uicrPath` for the display's UICR dump.

A descriptor becomes publishable by gaining a `release` block:

```ts
release: {
  version: "1.0.0",          // the archive's own version
  controllerVersion: 311,    // or nrfVersion: "221122" on a display descriptor
},
```

The dividing line: a descriptor's `name` identifies the firmware it was derived
_from_; everything in `release` describes what comes _out_. The reported version
is an explicit output fact. When a controller family supports changing it, a
source-specific helper produces both the byte patches and the value placed in
the release block.

**A release is not necessarily a patch.** A descriptor with an empty `patches`
array publishes the pristine image, which is how "go back to stock" works. It
still verifies `expectedSha256`, applies nothing, and packages the result.

Controller releases derived from the same factory image live under a directory
whose name matches the source directory under the repository's `firmware/`
tree. The 5.15.11 family is the reference layout:

```text
patches/406-BLUETOOTH-EXT1-51511/
├── lib.ts
├── lib.test.ts
├── stock.ts
└── unlocked.ts
```

`lib.ts` owns the input path, companion, address base, size, hash, and helpers
shared by the release descriptors beside it. Release checks discover descriptor
files recursively and ignore `lib.ts` and `*.test.ts`.

That family also passes its undotted reported version, such as `51516`, to
`reportedVersion()`. The helper returns both the binary patches and the same
numeric controller version for the archive manifest. A release therefore cannot
change one without changing the other.

Output-dependent metadata is expressed as ordered `finalizers`, which run after
the ordinary patches. For this FTEX image, `sha256TlvPatch` hashes the completed
MCUboot image and writes its SHA-256 TLV; `outerCrcPatch` then calculates the
outer CAN-DFU CRC over the image containing that new digest. Patch variants do
not carry precomputed integrity values.

## What is checked

- `expectedSize` and `expectedSha256` pin the input. They are required on
  controller descriptors and should be set on display ones: without them a
  garbled dump would be patched, have its CRCs recomputed to match, and ship as
  a bootable-looking archive.
- Every patch's original bytes must match before any are applied.
- A patch's replacement must be the same width as the bytes it verified.
  `Buffer.copy` truncates silently, so a mismatch would half-apply and still
  report success.
- Controller finalizers are generated, verified, and applied in declaration
  order after the ordinary patches.
- Display images additionally get their bootloader settings and bank-0 CRCs
  recomputed, or the bootloader would reject the app it now holds.

Patches are all verified against the pristine image before any are applied, so
two patches covering the same address both report OK and the last one wins.
Watch for that when adding patches near the large blob edits.

`scripts/releases.test.ts` rebuilds every descriptor that declares a release and
compares against the published archive, so an edited descriptor cannot silently
diverge from firmware people already installed.

Run `bun kitchen` to see all commands.
