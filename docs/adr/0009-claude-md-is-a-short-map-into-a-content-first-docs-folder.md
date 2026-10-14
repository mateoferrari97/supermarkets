---
Status: accepted
---

# `CLAUDE.md` is a short map into a content-first `docs/`; `.scratch/` is never linked

Repository knowledge is the system of record for agents. `CLAUDE.md` stays short (about 100 lines): the standing rules, a Map of one-line pointers, the Commands, a short Workflow and the file naming rule; detail lives in the documents it points to. There is no `AGENTS.md`.

A document exists only when it holds knowledge an agent needs: `ARCHITECTURE.md` at the root (the product in one paragraph, layers and ports from ADR 0006, a codemap of an order end to end, and the data folders), `GLOSSARY.md` at the root, `docs/LLM.md`, `docs/TESTING.md`, `docs/adr/` with a `README.md` index, `docs/product-specs/`, `docs/references/` (facts about external systems the code depends on, starting with `carrefour-api.md`) and `docs/agents/`. `GLOSSARY.md` and `docs/agents/` stay where they are because the agent skills hard-code those paths. Top-level documents (root and directly under `docs/`) are UPPERCASE; documents in subfolders are lowercase kebab-case; folder indexes are `README.md`.

`.scratch/` holds the work in flight (maps, specs, tickets, research, debt) and can be deleted at any time, so nothing stable (`docs/`, `CLAUDE.md`, ADRs, code) refers into it. Nothing is promoted from `.scratch/` into `docs/` as a rule; facts about external systems go to `docs/references/` because of their kind. Migration and feature plans are `.scratch/` specs and tickets, not exec plans.

## Considered Options

- **The full harness-engineering layout (https://openai.com/index/harness-engineering/).** Rejected for files with nothing to hold: `docs/design-docs/` (ADRs already are the design docs), `docs/generated/`, `QUALITY_SCORE.md` (repeats `pnpm check`), `tech-debt-tracker.md` (debt is a `.scratch/` issue), `DESIGN.md`, `FRONTEND.md`, `PRODUCT_SENSE.md`, `RELIABILITY.md` and `SECURITY.md`.
- **OpenAI's ExecPlan format (https://github.com/openai/openai-cookbook/blob/main/articles/codex_exec_plans.md).** Its living sections already exist in `.scratch/` tickets (`Status:`, `## Answer`, `## Comments`, closing the spec); an exec plan would be a second place holding the status of the same work.
- **Promoting closed specs into `docs/product-specs/`.** Specs record how a feature was planned, not how the code works now; they stay in `.scratch/`.
