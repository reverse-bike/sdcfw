import { expect, test } from "bun:test";
import { unzipSync, zipSync } from "fflate";
import { buildPackage } from "./build.js";
import { MANIFEST_NAME, packageFileName } from "./manifest.js";
import { MissingManifestError, PackageError, readPackage } from "./read.js";

const bin = new Uint8Array([1, 2, 3, 4]);
const dat = new Uint8Array([9, 9]);
const flash = new Uint8Array([5, 6, 7]);
const uicr = new Uint8Array([8]);

/**
 * Await a promise expected to reject and return the reason.
 *
 * Preferred over `expect(...).rejects`, which bun types as returning `void`,
 * making the required `await` look like a mistake to editors.
 */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject");
}

function controllerBuild(overrides: { kind?: "patched" | "stock"; source?: Uint8Array } = {}) {
  return {
    target: "controller" as const,
    version: "1.0.0",
    kind: overrides.kind ?? ("patched" as const),
    controllerVersion: 311,
    bin: { name: "fw.patched.bin", data: bin },
    dat: { name: "fw.dat", data: dat },
    source: { name: "fw.bin", data: overrides.source ?? new Uint8Array([0, 0, 0, 0]) },
  };
}

test("composes archive names from target, reported version, and kind", () => {
  expect(
    packageFileName({
      target: "controller",
      reportedVersion: 311,
      kind: "patched",
      version: "1.0.0",
    }),
  ).toBe("mc-311-patched-v1.0.0.zip");
  expect(
    packageFileName({
      target: "controller",
      reportedVersion: 310,
      kind: "stock",
      version: "2.1.0",
    }),
  ).toBe("mc-310-stock-v2.1.0.zip");
  expect(
    packageFileName({
      target: "nrf",
      reportedVersion: "221122",
      kind: "patched",
      version: "1.0.0",
    }),
  ).toBe("nrf-221122-patched-v1.0.0.zip");
});

test("round-trips a controller package", async () => {
  const built = await buildPackage(controllerBuild());
  expect(built.fileName).toBe("mc-311-patched-v1.0.0.zip");

  const read = await readPackage(built.zip);
  if (read.target !== "controller") throw new Error("expected a controller package");
  expect(read.bin).toEqual(bin);
  expect(read.dat).toEqual(dat);
  expect(read.manifest.provides.controllerVersion).toBe(311);
  expect(read.manifest.version).toBe("1.0.0");
  expect(read.manifest.files.bin.name).toBe("fw.patched.bin");
});

test("round-trips a display package", async () => {
  const built = await buildPackage({
    target: "nrf",
    version: "1.0.0",
    kind: "patched",
    nrfVersion: "221122",
    flash: { name: "flash.bin", data: flash },
    uicr: { name: "uicr.bin", data: uicr },
    source: { name: "flash.bin", data: new Uint8Array([0, 0, 0]) },
  });

  const read = await readPackage(built.zip);
  if (read.target !== "nrf") throw new Error("expected a display package");
  expect(read.flash).toEqual(flash);
  expect(read.uicr).toEqual(uicr);
  expect(read.manifest.provides.nrfVersion).toBe("221122");
});

test("builds archives whose entries are identical across runs", async () => {
  const first = unzipSync((await buildPackage(controllerBuild())).zip);
  const second = unzipSync((await buildPackage(controllerBuild())).zip);
  expect(Object.keys(first).sort()).toEqual(Object.keys(second).sort());
  for (const [name, data] of Object.entries(first)) {
    expect(second[name]).toEqual(data);
  }
});

test("rejects a stock release whose output differs from its source", async () => {
  const error = await rejection(buildPackage(controllerBuild({ kind: "stock" })));
  expect(String(error)).toMatch(/stock release does not match its source/);
});

test("accepts a stock release that reproduces its source", async () => {
  const built = await buildPackage(controllerBuild({ kind: "stock", source: bin }));
  expect(built.fileName).toBe("mc-311-stock-v1.0.0.zip");
});

test("rejects a tampered file", async () => {
  const built = await buildPackage(controllerBuild());
  const contents = unzipSync(built.zip);
  contents["fw.patched.bin"] = new Uint8Array([9, 9, 9, 9]);

  const error = await rejection(readPackage(zipSync(contents)));
  expect(String(error)).toMatch(/does not match its manifest hash/);
});

test("rejects an unknown manifest schema", async () => {
  const zip = zipSync({
    [MANIFEST_NAME]: new TextEncoder().encode(JSON.stringify({ schema: 2, target: "controller" })),
  });
  expect(String(await rejection(readPackage(zip)))).toMatch(/unsupported manifest schema 2/);
});

test("reports a missing manifest distinctly", async () => {
  const zip = zipSync({ "flash.bin": flash });
  expect(await rejection(readPackage(zip))).toBeInstanceOf(MissingManifestError);
});

test("reports a missing file named in the manifest", async () => {
  const built = await buildPackage(controllerBuild());
  const contents = unzipSync(built.zip);
  delete contents["fw.dat"];

  expect(await rejection(readPackage(zipSync(contents)))).toBeInstanceOf(PackageError);
});
