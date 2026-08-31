import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const firmware = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/firmware",
  }),
  schema: z.object({
    /** Display name for the firmware */
    name: z.string(),
    /** Path to the ZIP file relative to public folder (e.g., "/cfw/my-firmware.zip") */
    path: z.string(),
    /** Factory-image family this release belongs to. */
    family: z.string(),
    /** Stable identity within a factory-image family. */
    variant: z.string(),
    /** Release date */
    date: z.coerce.date(),
    /** Short description shown in the list */
    description: z.string(),
    /** Optional: specific bike models this firmware is compatible with */
    compatibility: z.array(z.string()).optional(),
    /**
     * Which bikes this release may be flashed onto.
     *
     * Deliberately kept here rather than in the archive: we expect to learn
     * that more setups work without wanting to re-cut and re-hash a release.
     * Versions are patterns where `X` matches any digit, so `3XX` covers the
     * stock versions, the versions our own releases report, and anything that
     * differs only in the trailing digits.
     */
    requires: z
      .object({
        /** Version patterns the bike's controller may report, e.g. ["3XX"] */
        controllerVersion: z.array(z.string()).nonempty(),
        /** Optional allow-list of controller variants */
        controllerVariant: z.array(z.number()).nonempty().optional(),
      })
      .optional(),
    /** Optional: mark as beta/experimental */
    experimental: z.boolean().optional().default(false),
    /**
     * Marks the unmodified factory image, published so people can go back to
     * it. Listed apart from custom releases rather than competing with them.
     */
    stock: z.boolean().optional().default(false),
    /** Show this release on the downloads page, but not in the guided flasher. */
    downloadOnly: z.boolean().optional().default(false),
  }),
});

const firmwareFamilies = defineCollection({
  loader: glob({
    pattern: "**/[^_]*.{md,mdx}",
    base: "./src/content/firmware-families",
  }),
  schema: z.object({
    /** Human name for this factory-image family. */
    name: z.string(),
    /** Device class shared by every release in the family. */
    target: z.enum(["controller", "nrf"]),
    /** Version reported by the pristine factory image. */
    factoryVersion: z.union([z.number().int(), z.string()]),
    /** Short explanation shown above the family's variants. */
    description: z.string(),
    /** Optional bike models shared by every release in the family. */
    compatibility: z.array(z.string()).optional(),
    /** Which connected controllers may use releases derived from this image. */
    requires: z
      .object({
        controllerVersion: z.array(z.string()).nonempty(),
        controllerVariant: z.array(z.number()).nonempty().optional(),
      })
      .optional(),
  }),
});

export const collections = { firmware, firmwareFamilies };
