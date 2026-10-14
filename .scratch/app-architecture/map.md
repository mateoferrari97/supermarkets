# Map: Next.js app with clean architecture and an agent-first knowledge base

Label: wayfinder:map

## Destination

A ready-to-execute migration plan: ADRs for every decision (layers and adapters, stack, docs layout, docs checks) and one spec at `.scratch/app-architecture-migration/spec.md` that slices the migration into build tickets. No code is migrated inside this map.

## Notes

- Target stack: Node.js 24, Next.js, Vitest. Vitest replaces `node:test` everywhere, including `scripts/`; `pnpm test` runs Vitest inside `pnpm check`.
- Clean architecture: layers that talk only through ports, with adapters at the edges. Next.js and the operator CLI are both delivery adapters over the same use cases.
- The web app is a small, basic chat for the Owner that replaces `pnpm order`: free-text order, questions when in doubt, picked products. `pnpm order` is removed. Operator scripts (`carrefour:catalog`, `seed:*`, `order:eval`, the validators in `pnpm check`) survive as CLI over the same core.
- Runs locally only (`pnpm dev`). The LLM adapter keeps spawning local Claude Code sessions; moving to the API is a later effort.
- Docs follow the "repository knowledge is the system of record" approach: `CLAUDE.md` is the short map (~100 lines) pointing into a structured `docs/`. No `AGENTS.md`. Mechanical checks of the knowledge base run in `pnpm check`.
- `.scratch/` stays as the ephemeral issue tracker; `docs/` holds consolidated knowledge.
- For grilling tickets use the `grilling` and `domain-modeling` skills; for layering tickets also `codebase-design`.

## Decisions so far

- [ExecPlan format](issues/06-execplan-format.md): what OpenAI's ExecPlan format and harness-engineering layout are; not adopted, see [Mechanical docs checks](issues/07-mechanical-docs-checks.md).
- [Toolchain compatibility](issues/02-toolchain-compatibility.md): Next.js 16 and Vitest 5 work on Node 24, ESM, `.ts` imports, TS 6/7 aliases and ESLint 10, with config caveats (`agentRules: false`, ignores for `.next/`; `eslint-config-next` pulls plugins without ESLint 10 peer support); moving tests to Vitest is a one-line import change per file.
- [Chat flow](issues/03-chat-flow.md): classic chat (prototype variant A): all questions in one numbered message with option chips plus free text, progress as a live list of steps, final cart table with reasons and total and no cost line; the `OrderResolution` lives in server memory under a session id.
- [Layers and dependency rule](issues/01-layers-and-dependency-rule.md): one package with `src/core/<feature>/`, `src/adapters/<technology>/`, `src/compose.ts`, `src/cli/` and `src/app/`; only `Llm` and `OnlineStore` are ports; the rule is ESLint `no-restricted-imports` with `cli` and `app` reaching adapters only through `compose`.
- [Surviving operator scripts](issues/04-surviving-operator-scripts.md): every operator command survives under its current `pnpm` name except `order`; one file per command in `src/cli/`, no `node:fs` there, all file I/O through `compose` loaders and savers in `adapters/files`; loaders run the full data validation, shared by the chat and the validator commands.
- [Docs layout](issues/05-docs-layout.md): content-first layout: root `ARCHITECTURE.md` (product, layers, order codemap, data), `docs/LLM.md`, `docs/TESTING.md`, `docs/product-specs/`, `docs/references/carrefour-api.md`, `docs/adr/` with an index; `GLOSSARY.md` and `docs/agents/` stay put; specs stay in `.scratch/` and nothing stable links there; top-level docs UPPERCASE, subfolder docs kebab-case.
- [Mechanical docs checks](issues/07-mechanical-docs-checks.md): no exec plans, migration plans are `.scratch/` specs and tickets; `scripts/check-docs.ts` as `pnpm docs:check` after `no-comments` checks relative links and anchors, no `.scratch/<path>` reference outside `.scratch/`, folder `README.md` indexes and the `CLAUDE.md` Map, ADR `Status`, `CLAUDE.md` at most 120 lines, cited `src/` paths and `ARCHITECTURE.md` naming every core feature and adapter, and file naming.
- [Chat plumbing](issues/10-chat-plumbing.md): one `POST` route handler per turn streams NDJSON events; a new `core/order-conversation` `takeTurn` state machine replaces `scripts/order.ts`, reporting typed steps through an `onStep` callback that `app` renders in Spanish; sessions live in a `globalThis` `Map` in `app` under a server-made id kept in React state, deleted on cart, failure or 1 h idle; disconnects abort through an `AbortSignal` on both ports, concurrent turns get 409.
- [Migration order](issues/11-migration-order.md): seven build tickets, `pnpm check` green after each; Vitest and the layer move in parallel, then the ESLint layer rule, then docs and `pnpm docs:check`, then `src/cli/`, then `takeTurn` (which removes `pnpm order`, no side by side), then the chat, closed by one real order.
- [Write the migration spec and build tickets](issues/08-write-the-migration-spec-and-build-tickets.md): ADRs 0006 to 0010 written; spec `.scratch/app-architecture-migration/spec.md` with seven `ready-for-agent` tickets; the chat asks the postal code first and shows notices, unapplied preferences and the cart link.

## Not yet specified

- None.

## Out of scope

- Deploying the app (Vercel or elsewhere), secrets, and hosting the Catalog Snapshot outside `.data/`.
- Moving the LLM adapter from local Claude Code sessions to the Anthropic API.
- A recurring doc-gardening agent that opens fix-up changes; revisit once the docs structure is stable.
- `QUALITY_SCORE.md`, `tech-debt-tracker.md` and the other harness-engineering docs with nothing to hold yet ([Docs layout](issues/05-docs-layout.md)); debt stays as `.scratch/` issues.
- Executing the migration; it starts from the migration spec once this map is done.
