# 04: Lay out the knowledge base and check it with pnpm docs:check

**What to build:** An agent opening the repo finds a ~100-line `CLAUDE.md` that maps into `ARCHITECTURE.md` and a content-first `docs/` (ADR 0009), and `pnpm check` fails when those docs drift (ADR 0010). From this ticket on, each ticket updates the docs it touches. See `.scratch/app-architecture-migration/spec.md` (Knowledge base).

**Blocked by:** 01, 03

**Status:** resolved

- [x] `ARCHITECTURE.md` at the root: the product in one paragraph, layers, ports and the dependency rule, a codemap of an order end to end naming the module of each step, and a Data section on `vocabulary/`, `evals/`, `prompts/` and `.data/`. It describes the folders as they exist after 03.
- [x] `docs/LLM.md` and `docs/TESTING.md` written.
- [x] `docs/product-type-seed-rules.md` moved to `docs/product-specs/product-type-seed-rules.md`, and both references in `.claude/skills/seed-product-types/SKILL.md` updated.
- [x] `docs/references/carrefour-api.md` written from the Carrefour research notes in `.scratch/carrefour-cart/research/`: search, facets, simulation and regions endpoints, quirks and the fixtures that record them.
- [x] ADRs 0001, 0002 and 0005 no longer cite `.scratch/`: Carrefour facts point at `docs/references/carrefour-api.md`; the Thinking Machines result in ADR 0002 cites its original source, found from the research note (if it cannot be found, say so in this ticket instead of inventing a URL).
- [x] `README.md` indexes in `docs/adr/`, `docs/product-specs/`, `docs/references/` and `docs/agents/`.
- [x] `CLAUDE.md` rewritten: current rules, Map, Commands (replacing "Catalog data"), Workflow, File naming; at most 120 lines; no reference into `.scratch/<literal>`.
- [x] `scripts/check-docs.ts` with Vitest tests implements the seven checks of ADR 0010; `pnpm docs:check` runs it and `pnpm check` runs `pnpm docs:check` right after `pnpm no-comments`.
- [x] Shown to work: a broken link, a missing index entry and a `.scratch/` citation each fail `pnpm docs:check` with file, line and rule (noted in this ticket, then reverted).
- [x] `pnpm check` exits 0.

## Comments

- Decision (coordinator, 2026-10-14): ADR 0002's front matter was `Status: accepted, partly superseded by ADR 0005`, which check 4 rejects. It is now `Status: accepted`, and a sentence in its body says ADR 0005 supersedes how the products are picked.
- Decision (coordinator, 2026-10-14): check 6 skips `docs/adr/`, because ADRs record decisions that can name paths before they exist (ADRs 0006 and 0008 cite `src/cli/`, `src/app/` and `src/core/order-conversation/`, which tickets 05 to 07 create). ADR 0010 item 6 now says so.
- Decision (the Owner, through the coordinator, 2026-10-14): the command is `pnpm docs:check`, not `pnpm docs`. On pnpm 12.8.1 `docs` is a built-in pnpm command: `pnpm docs` printed `error: the following required arguments were not provided: <PACKAGE>` and exited 2 instead of running the script. ADR 0010, the spec, this ticket, `CLAUDE.md` and the closed `app-architecture` map and tickets now say `pnpm docs:check`; this file keeps its name.
- The Thinking Machines result in ADR 0002 now cites its original source, found in the research note's source list: https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/
- `scripts/check-docs.ts` reads the files `git ls-files --cached --others --exclude-standard` lists that exist on disk, so a new document is checked before it is committed and a file deleted but still in the index is skipped.
- How the checks read ADR 0010: a `.scratch/` literal segment starts with a letter, digit, `_`, `.` or `-`, so `.scratch/`, `.scratch/<feature>/` and `.scratch/**` pass; check 2 runs on every file outside `.scratch/` and `prompts/`, the other checks on Markdown only. Check 3 takes the Map as the `## Map` section of `CLAUDE.md` and wants every root Markdown file other than `CLAUDE.md`, every Markdown file directly under `docs/` and every `README.md` under `docs/` linked there. Check 6 skips cited paths with placeholders (`<`, `*`, `{`, `...`) and requires `ARCHITECTURE.md` to contain `src/core/<feature>/` and `src/adapters/<technology>/` for every such folder. Anchors follow GitHub's slugs: lowercase, punctuation other than `-` and `_` removed, spaces to `-`, `-1`, `-2` for repeats.
- `ARCHITECTURE.md` and the Commands of `CLAUDE.md` describe the repo as it is now: operator commands and `pnpm order` in `scripts/`, no `src/cli/` or `src/app/`, no `pnpm dev`. Tickets 05 to 07 update them.
- `ARCHITECTURE.md` was added to `.prettierignore`, like `CLAUDE.md` and `GLOSSARY.md`.
- The fixtures `simulation-banana.json` and `simulation-two.json` in `src/adapters/carrefour/fixtures/` are read by no test; `docs/references/carrefour-api.md` says so.
- Shown to work (2026-10-14, each change reverted afterwards, then `pnpm docs:check` exited 0):
  - Broken link, `See [missing](references/nowhere.md).` appended to `docs/TESTING.md`: `docs/TESTING.md:32: [links] references/nowhere.md does not exist`, exit 1.
  - Missing index entry, a new `docs/references/other-store.md`: `docs/references/README.md:1: [indexes] does not link other-store.md`, exit 1.
  - `.scratch/` citation, a backticked path into the Carrefour research notes appended to `docs/TESTING.md`: `docs/TESTING.md:32: [scratch] refers into .scratch/, which can be deleted at any time`, exit 1.
- `pnpm check` exited 0 on 2026-10-14: typecheck, lint, format, no-comments, docs:check, 16 test files with 159 tests, and the three data validators.
