# SuperDuper CFW Site

This site is the end user interface for interacting with the ebike. It supports firmware backup and restore. It has an interface for advanced users, and a guided interface for beginners.

This site uses WebUSB, and as such must be used on a Chrome-based browser.

## Architecture

This is an Astrojs static, multi-page site, with SolidJS used for interactive parts. Otherwise it is a standard AstroJS site.

## 🧞 Commands

All commands are run from the root of the `web` folder:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `bun install`             | Installs dependencies                            |
| `bun dev`             | Starts local dev server at `localhost:4321`      |
| `bun build`           | Build your production site to `./dist/`          |
| `bun preview`         | Preview your build locally, before deploying     |
| `bun astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `bun astro -- --help` | Get help using the Astro CLI                     |
