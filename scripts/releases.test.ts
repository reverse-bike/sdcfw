/**
 * Guards the published firmware archives in apps/web/public/cfw.
 *
 * Archives are hand-linked from site content, so the two can drift: an entry
 * can point at a file that was never cut, or claim a version the archive does
 * not carry. Everything here is checkable without hardware.
 *
 * Compatibility is deliberately not cross-checked. It exists only in content,
 * precisely so it can change without re-cutting an archive.
 */
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readPackage, type PackageManifest } from "@sdcfw/firmware-utils";
import { buildPatchedImage } from "../apps/kitchen/patcher";
import type { PatchFile } from "../apps/kitchen/patches/types";

const projectRoot = path.resolve(import.meta.dir, "..");
const archiveDir = path.join(projectRoot, "apps/web/public/cfw");
const contentDir = path.join(projectRoot, "apps/web/src/content/firmware");

interface ContentEntry {
  file: string;
  name: string;
  version: string;
  target: string;
  path: string;
  requires?: { controllerVersion?: string[]; controllerVariant?: number[] };
}

function archiveFiles(): string[] {
  return readdirSync(archiveDir)
    .filter((file) => file.endsWith(".zip"))
    .sort();
}

function contentEntries(): ContentEntry[] {
  return readdirSync(contentDir)
    .filter((file) => file.endsWith(".md") && !file.startsWith("_"))
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(contentDir, file), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1];
      if (!frontmatter) throw new Error(`${file} has no frontmatter`);
      const data = Bun.YAML.parse(frontmatter) as Omit<ContentEntry, "file">;
      return { file, ...data };
    });
}

async function manifestOf(file: string): Promise<PackageManifest> {
  const zip = new Uint8Array(readFileSync(path.join(archiveDir, file)));
  return (await readPackage(zip)).manifest;
}

test("every published archive parses and matches its own hashes", async () => {
  const files = archiveFiles();
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    // readPackage verifies each entry against the manifest, so this throwing
    // means the archive is corrupt or was edited after it was built.
    const manifest = await manifestOf(file);
    expect(manifest.schema).toBe(1);
    expect(manifest.version.length).toBeGreaterThan(0);
  }
});

test("every content entry points at an archive that agrees with it", async () => {
  const files = new Set(archiveFiles());

  for (const entry of contentEntries()) {
    const prefix = "/cfw/";
    expect(entry.path.startsWith(prefix)).toBe(true);

    const file = entry.path.slice(prefix.length);
    if (!files.has(file)) {
      throw new Error(`${entry.file} points at ${entry.path}, which does not exist`);
    }

    const manifest = await manifestOf(file);
    expect(`${entry.file}: ${manifest.version}`).toBe(`${entry.file}: ${entry.version}`);
    expect(`${entry.file}: ${manifest.target}`).toBe(`${entry.file}: ${entry.target}`);
  }
});

test("controller entries declare what they may be flashed onto", () => {
  for (const entry of contentEntries()) {
    if (entry.target !== "controller") continue;
    const patterns = entry.requires?.controllerVersion ?? [];
    expect(`${entry.file}: ${patterns.length > 0}`).toBe(`${entry.file}: true`);
    for (const pattern of patterns) {
      expect(`${entry.file}: ${/^[0-9X]+$/.test(pattern)}`).toBe(`${entry.file}: true`);
    }
  }
});

test("no archive is published without a content entry describing it", () => {
  const linked = new Set(contentEntries().map((entry) => entry.path.replace("/cfw/", "")));
  for (const file of archiveFiles()) {
    if (!linked.has(file)) {
      throw new Error(
        `${file} is published but no content entry links it, so nothing on the site can offer it`,
      );
    }
  }
});

test("published archives still match the descriptors that produced them", async () => {
  const descriptorDir = path.join(projectRoot, "apps/kitchen/patches");
  const descriptors = readdirSync(descriptorDir)
    .filter((file) => file.endsWith(".ts") && file !== "types.ts")
    .sort();

  const archives = archiveFiles();
  let checked = 0;

  for (const file of descriptors) {
    const patchFile = ((await import(path.join(descriptorDir, file))) as { default: PatchFile })
      .default;
    if (!patchFile.release) continue;

    const source = readFileSync(path.join(projectRoot, patchFile.firmwarePath));
    // Rebuilding is what catches an edited descriptor drifting away from
    // firmware people have already installed.
    const { output } = buildPatchedImage(patchFile, source);
    const companionPath =
      patchFile.target === "controller" ? patchFile.datPath : patchFile.uicrPath;
    const companion = readFileSync(path.join(projectRoot, companionPath));

    const reported =
      patchFile.target === "controller"
        ? patchFile.release.controllerVersion
        : patchFile.release.nrfVersion;
    const kind = patchFile.patches.length > 0 ? "patched" : "stock";
    const prefix = patchFile.target === "controller" ? "mc" : "nrf";
    const expected = `${prefix}-${reported}-${kind}-v${patchFile.release.version}.zip`;

    if (!archives.includes(expected)) {
      throw new Error(`${file} declares a release, but ${expected} is not published`);
    }

    const parsed = await readPackage(new Uint8Array(readFileSync(path.join(archiveDir, expected))));
    const published = parsed.target === "controller" ? parsed.bin : parsed.flash;
    expect(`${expected} image: ${Buffer.from(published).equals(output)}`).toBe(
      `${expected} image: true`,
    );

    // The companion ships unmodified but is just as capable of being wrong: a
    // .dat from another build passes every other check and fails on the bike.
    const publishedCompanion = parsed.target === "controller" ? parsed.dat : parsed.uicr;
    expect(`${expected} companion: ${Buffer.from(publishedCompanion).equals(companion)}`).toBe(
      `${expected} companion: true`,
    );

    // provides is the only post-flash success signal, and nothing else compares
    // it against the descriptor, since filenames are never parsed back.
    const publishedReports =
      parsed.target === "controller"
        ? parsed.manifest.provides.controllerVersion
        : parsed.manifest.provides.nrfVersion;
    expect(`${expected} reports: ${publishedReports}`).toBe(`${expected} reports: ${reported}`);
    checked++;
  }

  expect(checked).toBeGreaterThan(0);
});
