// @ts-check
import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'url';
import path from 'path';

import solidJs from '@astrojs/solid-js';

import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://astro.build/config
export default defineConfig({
  output: 'static',
  integrations: [solidJs()],

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        // Polyfill for Node.js 'events' module used by dapjs (browser compatibility)
        'events': path.resolve(__dirname, 'src/polyfills/events.ts'),
      }
    },
    optimizeDeps: {
      exclude: ['usb']
    }
  }
});
