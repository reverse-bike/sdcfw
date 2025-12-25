import { defineCollection, z } from 'astro:content';

const firmware = defineCollection({
	type: 'content',
	schema: z.object({
		/** Display name for the firmware */
		name: z.string(),
		/** Version string (e.g., "1.0.0", "beta-1") */
		version: z.string(),
		/** Path to the ZIP file relative to public folder (e.g., "/cfw/my-firmware.zip") */
		path: z.string(),
		/** Release date */
		date: z.coerce.date(),
		/** Short description shown in the list */
		description: z.string(),
		/** Optional: specific bike models this firmware is compatible with */
		compatibility: z.array(z.string()).optional(),
		/** Optional: mark as beta/experimental */
		experimental: z.boolean().optional().default(false),
	}),
});

export const collections = { firmware };
