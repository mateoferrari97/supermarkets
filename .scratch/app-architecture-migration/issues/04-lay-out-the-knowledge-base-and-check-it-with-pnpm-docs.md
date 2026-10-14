# 04: Lay out the knowledge base and check it with pnpm docs

**What to build:** An agent opening the repo finds a ~100-line `CLAUDE.md` that maps into `ARCHITECTURE.md` and a content-first `docs/` (ADR 0009), and `pnpm check` fails when those docs drift (ADR 0010). From this ticket on, each ticket updates the docs it touches. See `.scratch/app-architecture-migration/spec.md` (Knowledge base).

**Blocked by:** 01, 03

**Status:** ready-for-agent

- [ ] `ARCHITECTURE.md` at the root: the product in one paragraph, layers, ports and the dependency rule, a codemap of an order end to end naming the module of each step, and a Data section on `vocabulary/`, `evals/`, `prompts/` and `.data/`. It describes the folders as they exist after 03.
- [ ] `docs/LLM.md` and `docs/TESTING.md` written.
- [ ] `docs/product-type-seed-rules.md` moved to `docs/product-specs/product-type-seed-rules.md`, and both references in `.claude/skills/seed-product-types/SKILL.md` updated.
- [ ] `docs/references/carrefour-api.md` written from the Carrefour research notes in `.scratch/carrefour-cart/research/`: search, facets, simulation and regions endpoints, quirks and the fixtures that record them.
- [ ] ADRs 0001, 0002 and 0005 no longer cite `.scratch/`: Carrefour facts point at `docs/references/carrefour-api.md`; the Thinking Machines result in ADR 0002 cites its original source, found from the research note (if it cannot be found, say so in this ticket instead of inventing a URL).
- [ ] `README.md` indexes in `docs/adr/`, `docs/product-specs/`, `docs/references/` and `docs/agents/`.
- [ ] `CLAUDE.md` rewritten: current rules, Map, Commands (replacing "Catalog data"), Workflow, File naming; at most 120 lines; no reference into `.scratch/<literal>`.
- [ ] `scripts/check-docs.ts` with Vitest tests implements the seven checks of ADR 0010; `pnpm docs` runs it and `pnpm check` runs `pnpm docs` right after `pnpm no-comments`.
- [ ] Shown to work: a broken link, a missing index entry and a `.scratch/` citation each fail `pnpm docs` with file, line and rule (noted in this ticket, then reverted).
- [ ] `pnpm check` exits 0.
