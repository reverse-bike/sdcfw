/**
 * Guards the published firmware archives in apps/web/public/cfw.
 *
 * Archives are hand-linked from site content, so the two can drift: an entry
 * can point at a file that was never cut, or claim a version the archive does
 * not carry. Everything here is checkable without hardware.
 *
 * An archive may be published without a content entry. Nothing on the site
 * lists it then, but it is still served by direct link, which is how a release
 * is handed to a few people before it is offered to everyone.
 *
 * Compatibility is deliberately not cross-checked. It exists only in content,
 * precisely so it can change without re-cutting an archive.
 */
import { expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { readPackage, type PackageManifest } from "@sdcfw/firmware-utils";
import { archiveFileName } from "../apps/kitchen/archive";
import { buildPatchedImage } from "../apps/kitchen/patcher";
import type { PatchFile } from "../apps/kitchen/patches/types";

const projectRoot = path.resolve(import.meta.dir, "..");
const archiveDir = path.join(projectRoot, "apps/web/public/cfw");
const contentDir = path.join(projectRoot, "apps/web/src/content/firmware");
const descriptorDir = path.join(projectRoot, "apps/kitchen/patches");

interface ContentEntry {
  file: string;
  name: string;
  path: string;
  anchor: string;
  family: string;
  variant: string;
  downloadOnly?: boolean;
  requires?: { controllerVersion?: string[]; controllerVariant?: number[] };
}

interface FamilyEntry {
  file: string;
  name: string;
  target: string;
  factoryVersion: number | string;
  requires?: { controllerVersion?: string[]; controllerVariant?: number[] };
}

function archiveFiles(): string[] {
  return readdirSync(archiveDir)
    .filter((file) => file.endsWith(".zip"))
    .sort();
}

function contentEntries(): ContentEntry[] {
  return [...new Bun.Glob("**/*.md").scanSync({ cwd: contentDir, onlyFiles: true })]
    .filter((file) => !path.posix.basename(file).startsWith("_"))
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(contentDir, file), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1];
      if (!frontmatter) throw new Error(`${file} has no frontmatter`);
      const data = Bun.YAML.parse(frontmatter) as Omit<ContentEntry, "file" | "family" | "variant">;
      return {
        file,
        family: path.posix.dirname(file),
        variant: path.posix.basename(file, ".md"),
        ...data,
      };
    });
}

function familyEntries(): FamilyEntry[] {
  return [...new Bun.Glob("**/_family.md").scanSync({ cwd: contentDir, onlyFiles: true })]
    .sort()
    .map((file) => {
      const raw = readFileSync(path.join(contentDir, file), "utf8");
      const frontmatter = /^---\n([\s\S]*?)\n---/.exec(raw)?.[1];
      if (!frontmatter) throw new Error(`${file} has no frontmatter`);
      const data = Bun.YAML.parse(frontmatter) as Omit<FamilyEntry, "file">;
      return { file, ...data };
    });
}

function familyId(family: FamilyEntry): string {
  return path.posix.dirname(family.file);
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

test("every content entry points at a valid archive", async () => {
  const files = new Set(archiveFiles());

  for (const entry of contentEntries()) {
    const prefix = "/cfw/";
    expect(entry.path.startsWith(prefix)).toBe(true);

    const file = entry.path.slice(prefix.length);
    if (!files.has(file)) {
      throw new Error(`${entry.file} points at ${entry.path}, which does not exist`);
    }

    await manifestOf(file);
  }
});

test("controller entries or their families declare what they may be flashed onto", async () => {
  const families = new Map(familyEntries().map((family) => [familyId(family), family]));
  for (const entry of contentEntries()) {
    const file = entry.path.replace("/cfw/", "");
    const manifest = await manifestOf(file);
    if (manifest.target !== "controller" || entry.downloadOnly) continue;
    const family = families.get(entry.family);
    const patterns = entry.requires?.controllerVersion ?? family?.requires?.controllerVersion ?? [];
    expect(`${entry.file}: ${patterns.length > 0}`).toBe(`${entry.file}: true`);
    for (const pattern of patterns) {
      expect(`${entry.file}: ${/^[0-9X]+$/.test(pattern)}`).toBe(`${entry.file}: true`);
    }
  }
});

test("firmware families contain uniquely identifiable variants", async () => {
  const families = familyEntries();
  const content = contentEntries();
  const familyIds = new Set(families.map(familyId));

  const anchors = content.map((entry) => entry.anchor);
  expect(anchors.every(Boolean)).toBe(true);
  expect(new Set(anchors).size).toBe(anchors.length);

  for (const entry of content) {
    expect(`${entry.file}: ${familyIds.has(entry.family)}`).toBe(`${entry.file}: true`);
  }

  for (const family of families) {
    const id = familyId(family);
    const variants = content.filter((entry) => entry.family === id);
    expect(`${family.file}: ${variants.length > 0}`).toBe(`${family.file}: true`);

    const variantIds = variants.map((entry) => entry.variant);
    expect(`${family.file}: ${variantIds.every(Boolean)}`).toBe(`${family.file}: true`);
    expect(`${family.file}: ${new Set(variantIds).size}`).toBe(
      `${family.file}: ${variantIds.length}`,
    );

    const reportedVersions = new Set<number>();
    for (const variant of variants) {
      const manifest = await manifestOf(variant.path.replace("/cfw/", ""));
      expect(`${variant.file}: ${manifest.target}`).toBe(`${variant.file}: ${family.target}`);
      if (manifest.target !== "controller") continue;
      const reported = manifest.provides.controllerVersion;
      if (reportedVersions.has(reported)) {
        throw new Error(`${family.file} has multiple variants that report ${reported}`);
      }
      reportedVersions.add(reported);
    }

    const stock = variants.find((variant) => variant.variant === "stock");
    if (stock) {
      const manifest = await manifestOf(stock.path.replace("/cfw/", ""));
      if (manifest.target !== "controller") throw new Error(`${stock.file} is not a controller`);
      expect(`${stock.file}: ${manifest.provides.controllerVersion}`).toBe(
        `${stock.file}: ${family.factoryVersion}`,
      );
    }
  }
});

test("published content mirrors the kitchen patch tree", () => {
  for (const family of familyEntries()) {
    const source = familyId(family);
    expect(`${family.file}: ${existsSync(path.join(descriptorDir, source, "lib.ts"))}`).toBe(
      `${family.file}: true`,
    );
  }

  for (const entry of contentEntries()) {
    const descriptor = path.join(descriptorDir, entry.family, `${entry.variant}.ts`);
    expect(`${entry.file}: ${existsSync(descriptor)}`).toBe(`${entry.file}: true`);
  }
});

test("every descriptor builds and published outputs still match", async () => {
  const descriptors = [...new Bun.Glob("**/*.ts").scanSync({ cwd: descriptorDir, onlyFiles: true })]
    .filter(
      (file) =>
        path.basename(file) !== "types.ts" &&
        path.basename(file) !== "lib.ts" &&
        !file.endsWith(".test.ts"),
    )
    .sort();

  const archives = archiveFiles();
  const content = contentEntries();
  let checked = 0;

  for (const file of descriptors) {
    const patchFile = ((await import(path.join(descriptorDir, file))) as { default: PatchFile })
      .default;
    const descriptorSource = path.basename(path.dirname(file));
    const firmwareSource = path.basename(path.dirname(patchFile.firmwarePath));
    expect(`${file}: ${descriptorSource}`).toBe(`${file}: ${firmwareSource}`);
    expect(`${file}: ${existsSync(path.join(descriptorDir, descriptorSource, "lib.ts"))}`).toBe(
      `${file}: true`,
    );

    const source = readFileSync(path.join(projectRoot, patchFile.firmwarePath));
    // Every descriptor must still recognize and build from its source, whether
    // or not that output has been published yet.
    const { output } = buildPatchedImage(patchFile, source);
    if (!patchFile.release) continue;

    // Rebuilding is what catches an edited release drifting away from firmware
    // people have already installed.
    const companionPath =
      patchFile.target === "controller" ? patchFile.datPath : patchFile.uicrPath;
    const companion = readFileSync(path.join(projectRoot, companionPath));

    // A content entry names the archive it links. Without one, the archive is
    // unlisted and must carry the name Kitchen gives it, or nothing could find it.
    const descriptorVariant = path.basename(file, ".ts");
    const entry = content.find(
      (candidate) =>
        candidate.family === descriptorSource && candidate.variant === descriptorVariant,
    );
    const reported =
      patchFile.target === "controller"
        ? patchFile.release.controllerVersion
        : patchFile.release.nrfVersion;
    const expected = entry
      ? entry.path.replace("/cfw/", "")
      : archiveFileName({
          sourceName: descriptorSource,
          variant: descriptorVariant,
          version: patchFile.release.version,
          ...(patchFile.patches.length > 0
            ? { stock: false, reportedVersion: reported }
            : { stock: true }),
        });

    if (!archives.includes(expected)) {
      throw new Error(
        entry
          ? `${entry.file} links ${expected}, but it is not published`
          : `${file} declares a release, but neither a content entry nor ${expected} is published`,
      );
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
