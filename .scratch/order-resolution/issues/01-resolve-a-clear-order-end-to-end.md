# 01: Resolve a clear order end to end

**What to build:** The Owner runs one command with an order in free text ("yerba, dos leches enteras y nada de huevos") and gets back every Item with its Product Type, quantity, brand and terms; things ruled out are not Items. The order is split by an LLM, each Item gets BM25 evidence from the product names of the Catalog Snapshot, and an LLM resolves it over the Product Type tree. Every LLM step goes through the LLM port; its real adapter runs a headless Claude Code session (pinned Haiku model, JSON schema, no tools, budget cap). This ticket covers Items that match one Product Type clearly. See `.scratch/order-resolution/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `resolveOrder` takes the order text and the dependencies (Catalog Snapshot products, vocabulary, Carrefour mapping, LLM port) and returns the Order Resolution.
- [x] The LLM port has a task to split an order into Items (phrase, quantity, terms, vague words, brand; exclusions dropped) and a task to resolve one Item over the tree with evidence; each output is validated by a zod schema.
- [x] The BM25 search covers only grocery products whose Tipo is mapped to a Product Type, works offline, and fails with a clear message when the local Catalog Snapshot is missing.
- [x] Product Type ids the LLM returns that are not in the tree are dropped.
- [x] The Claude Code session adapter runs the CLI in print mode with a pinned model, the task's prompt file, the task's JSON schema, no tools, no session persistence and a budget cap, and reports the cost of each call. No code calls the Claude API directly.
- [x] The adapter is tested with recorded CLI outputs through an injected process runner: valid answer, schema-invalid answer, CLI error, budget exceeded.
- [x] `resolveOrder` is tested end to end with a fake LLM and a small hand-made catalog, vocabulary and mapping: clear match, exclusion, quantity, brand, terms, invented id dropped.
- [x] A command runs `resolveOrder` on real Claude Code sessions; `yerba, dos leches enteras y nada de huevos` returns Yerba, Leche entera with quantity 2, and no Item for eggs.
- [x] Prompts are Markdown files in the repo, one per LLM task.
- [x] `pnpm check` exits 0 and does not run Claude Code sessions.

## Comments

The resolver is built once per run (`createOrderResolver`, which indexes the Catalog Snapshot), and `resolveOrder` wraps it for a single order. `pnpm order "<text>"` runs it on Claude Code sessions: `claude -p` with `claude-haiku-5-5`, the task prompt plus the tree as system prompt, the task's JSON schema (zod's `$schema` key removed, the CLI rejects the 2020-12 dialect), `--tools ""`, `--restricted`, `--strict-mcp-config`, no session persistence, a US$ 0.25 cap per call, and a temporary working directory so no project CLAUDE.md is loaded. A budget overrun exits 0 with `is_error: true` and `subtype: "error_max_budget_usd"`; the adapter treats any non-success subtype as an error.

Real runs on 2026-10-13:
- "yerba, dos leches enteras y nada de huevos": Yerba; Leche entera x2; no Item for eggs. 3 sessions, 8.2 s, US$ 0.0112.
- "necesito leche, un Cindor, dos cocas grandes de 2,25 y conos de queso sin TACC": leche pending as `grupo-leche`; Cindor to Leche chocolatada; coca to Gaseosa with brand Coca-Cola, term 2,25 and vague word "grandes"; conos de queso pending as the Snack salado Group (ADR 0003 expects the broad Snacks Product Type; an eval case for ticket 02). 5 sessions, 13.5 s, US$ 0.0035.
