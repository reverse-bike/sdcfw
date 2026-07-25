# firmware-utils

Reads and writes the firmware archives published under
`apps/web/public/cfw`. Runs in both Bun and the browser: Kitchen builds
archives with it, and the web tools read them.

## Archive format

An archive is a zip holding the firmware, its companion file, and a manifest
named `sdcfw.json`:

```text
mc-311-patched-v1.0.0.zip
├── sdcfw.json
├── GD_S73Rx_H104_S310US_20221020.patched.bin
└── GD_S73Rx_H104_S310US_20221020.dat
```

```json
{
  "schema": 1,
  "version": "1.0.0",
  "target": "controller",
  "files": {
    "bin": { "name": "…patched.bin", "sha256": "…" },
    "dat": { "name": "….dat", "sha256": "…" }
  },
  "source": { "name": "….bin", "sha256": "…" },
  "provides": { "controllerVersion": 311 }
}
```

Display archives use `target: "nrf"`, the roles `flash` and `uicr`, and
`provides.nrfVersion`. Their entry names stay `flash.bin` and `uicr.bin`,
which the restore tool and every backup a user has ever downloaded rely on.
Adding a manifest to one is backward compatible, since that tool looks entries
up by name and ignores anything else.

`source` records the image a release was built from, by repository path and
hash, so a rebuild is provably identical. It is not an archive entry: for
display releases the source is also called `flash.bin`, and naming it twice
with two hashes reads as a contradiction to anyone checking by hand.

Hashes are lowercase hex SHA-256 over the raw bytes, so they can be checked
with `shasum -a 256`. `readPackage` verifies every file against them.

## What is deliberately absent

- **File sizes and an image CRC.** The hash subsumes both, and the arm CRC is
  computed from the same bytes at flash time.
- **`appSize` and the firmware class.** Parsed from the `.dat` and validated
  when flashing.
- **Compatibility.** Which bikes a release may be flashed onto is knowledge
  that grows, so it lives in the site's content collection where it can change
  without re-cutting and re-hashing an archive.
- **An id or slug.** Filenames are composed from the manifest fields and are
  never parsed back; they exist for humans and for linking.

## Filenames

`packageFileName` composes `<target>-<reported version>-<patched|stock>-v<version>.zip`.
Kitchen owns this; nothing reads a filename to learn what an archive contains.

## Usage

```ts
import { readPackage, MissingManifestError } from "@sdcfw/firmware-utils";

const pkg = await readPackage(new Uint8Array(await file.arrayBuffer()));
if (pkg.target === "controller") {
  // pkg.bin, pkg.dat, pkg.manifest.provides.controllerVersion
}
```

`readPackage` throws `MissingManifestError` for archives with no manifest, so
callers can offer an unverified fallback rather than treating it as corruption.

Version compatibility is matched with `versionMatchesAny`, where `X` in a
pattern stands for any digit, so `3XX` covers 300 through 399.
