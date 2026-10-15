---
Status: accepted
---

# Layers as rings with features inside the core; only the LLM and the Online Store are ports

The code is one pnpm package with the layers at the top and features inside the core: `src/core/<feature>/` (domain rules, use cases and port types in one ring), `src/adapters/<technology>/`, `src/compose.ts` as the single composition root, and two delivery adapters over the same use cases, `src/cli/` (operator commands) and `src/app/` (the Next.js chat). `scripts/` holds only repo tooling and sits outside the architecture. Tests sit next to the file they test.

The dependency rule is ESLint's built-in `no-restricted-imports`, run by `pnpm lint` in `pnpm check`: `core` imports only `core` and zod; `adapters` import `core`, `node:*` and zod; `compose` imports `core` and `adapters`; `cli` and `app` import `core` and `compose`, never `adapters`. Imports between features inside `core` are free.

Only `Llm` and `OnlineStore` are ports, because only they have an adapter that really varies (Claude Code today, the Anthropic API later; Carrefour and test fakes). Static data (Catalog Snapshot, Product Types, Payment Cards, the eval set) is loaded by `adapters/files` and passed to `core` as arguments, with no port. `cli` never imports `node:fs`: every read and write goes through named loaders and savers that `compose` exposes, and every data loader runs the full validation (schema plus cross-references), so the chat and the validator commands share one check and the chat fails at startup instead of mid-order. zod is allowed in `core` for schemas of domain data; schemas that parse LLM output live in `adapters/claude-code`.

ADR 0012 adds a third port, `CatalogSearch`, so the search over the Catalog Snapshot can move to Postgres later; its one adapter today is in memory.

## Considered Options

- **Classic separate layers (`domain/`, `application/`, `ports/`, ...).** Rejected: order resolution is domain and use case at once, and splitting it yields shallow pass-through modules.
- **A pnpm monorepo with one package per layer.** More boundaries than one developer needs; the import rule gives the same guarantee in one package.
- **eslint-plugin-boundaries or dependency-cruiser.** A new dependency for what four `no-restricted-imports` patterns already express.
- **A port for every data source.** The static files never vary per adapter; loading them in `adapters/files` and passing the data in keeps `core` testable without interfaces nobody implements twice.
