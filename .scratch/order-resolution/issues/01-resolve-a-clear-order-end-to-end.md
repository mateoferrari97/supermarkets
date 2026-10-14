# 01: Resolve a clear order end to end

**What to build:** The Owner runs one command with an order in free text ("yerba, dos leches enteras y nada de huevos") and gets back every Item with its Product Type, quantity, brand and terms; things ruled out are not Items. The order is split by an LLM, each Item gets BM25 evidence from the product names of the Catalog Snapshot, and an LLM resolves it over the Product Type tree. Every LLM step goes through the LLM port; its real adapter runs a headless Claude Code session (pinned Haiku model, JSON schema, no tools, budget cap). This ticket covers Items that match one Product Type clearly. See `.scratch/order-resolution/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `resolveOrder` takes the order text and the dependencies (Catalog Snapshot products, vocabulary, Carrefour mapping, LLM port) and returns the Order Resolution.
- [ ] The LLM port has a task to split an order into Items (phrase, quantity, terms, vague words, brand; exclusions dropped) and a task to resolve one Item over the tree with evidence; each output is validated by a zod schema.
- [ ] The BM25 search covers only grocery products whose Tipo is mapped to a Product Type, works offline, and fails with a clear message when the local Catalog Snapshot is missing.
- [ ] Product Type ids the LLM returns that are not in the tree are dropped.
- [ ] The Claude Code session adapter runs the CLI in print mode with a pinned model, the task's prompt file, the task's JSON schema, no tools, no session persistence and a budget cap, and reports the cost of each call. No code calls the Claude API directly.
- [ ] The adapter is tested with recorded CLI outputs through an injected process runner: valid answer, schema-invalid answer, CLI error, budget exceeded.
- [ ] `resolveOrder` is tested end to end with a fake LLM and a small hand-made catalog, vocabulary and mapping: clear match, exclusion, quantity, brand, terms, invented id dropped.
- [ ] A command runs `resolveOrder` on real Claude Code sessions; `yerba, dos leches enteras y nada de huevos` returns Yerba, Leche entera with quantity 2, and no Item for eggs.
- [ ] Prompts are Markdown files in the repo, one per LLM task.
- [ ] `pnpm check` exits 0 and does not run Claude Code sessions.
