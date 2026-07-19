dev:
	cd apps/web && bun run dev

ts:
	bun run typecheck

outdated:
	bun outdated --recursive

test: ts
