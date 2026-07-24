dev:
	cd apps/web && bun run dev

outdated:
	bun outdated --recursive

test:
	bun run typecheck
	bun run lint
	bun run format:check
	bun test
