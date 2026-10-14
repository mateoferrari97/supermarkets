# 07: Mechanical docs checks

Type: grilling
Status: resolved
Blocked by: 05, 06

## Question

What does `pnpm check` validate about the knowledge base (broken links, indexes listing every doc, status or verification metadata, `CLAUDE.md` length, `ARCHITECTURE.md` agreeing with the code's layers, the UPPERCASE / kebab-case file naming rule, no link from `docs/`, `CLAUDE.md` or code into `.scratch/`; see 05), and with which tool or script?

## Answer

Decided with the Owner in a grilling session, after reading `package.json`, `scripts/no-comments.ts`, every tracked Markdown file outside `.scratch/` and the ADR format of the `domain-modeling` skill.

No exec plans. The Owner chose `.scratch/` specs and tickets over OpenAI's ExecPlan format: the four living sections already exist there (`Progress` is each ticket's `Status:`, `Decision Log` is each ticket's `## Answer` or an ADR, `Surprises & Discoveries` is `## Comments`, `Outcomes` is closing the spec), and exec plans would add a second place holding the status of the same work. So the migration plan is `.scratch/app-architecture-migration/spec.md` with build tickets in `issues/`; `docs/PLANS.md` and `docs/exec-plans/` are dropped from [Docs layout](05-docs-layout.md), and [Exec plan conventions](09-exec-plan-conventions.md) is closed as moot. The checker therefore checks no plan structure.

Tool: one script, `scripts/check-docs.ts`, run with `tsx` like `scripts/no-comments.ts`, no new dependency (remark would only cover broken links; every other rule is repo-specific), with Vitest tests next to it. Command `pnpm docs:check`, run in `pnpm check` right after `pnpm no-comments`. `scripts/` is repo tooling outside the architecture, per [Layers and dependency rule](01-layers-and-dependency-rule.md).

Files in scope:

- Link rules (below): every `git ls-files '*.md'` except `.scratch/` and `prompts/` (prompts are LLM input, not docs). This includes `.claude/skills/*/SKILL.md`.
- Naming and index rules: the repo root and `docs/` only.

Checks, each failing `pnpm docs:check` with the file, line and rule:

1. Broken links: every relative Markdown link points at an existing file, and every `#anchor` matches a heading of the target under GitHub's slug rules. External (`http`) links are not checked: the network would fail `pnpm check` with nothing changed in the repo. Links inside fenced code blocks are ignored.
2. No reference into `.scratch/`: any text `.scratch/<literal segment>` fails, in Markdown in scope and in code, including citations in backticks, not only links. Placeholders such as `.scratch/<feature>/` pass. Today ADRs 0001, 0002 and 0005 cite `.scratch/carrefour-cart/research/`; the build ticket that writes `docs/references/carrefour-api.md` repoints them there, and this check lands after that ticket.
3. Indexes: every subfolder of `docs/` has a `README.md` linking every sibling `.md`; the Map section of `CLAUDE.md` links every top-level doc (root and directly under `docs/`) and every folder `README.md`. Full reachability from `CLAUDE.md` is not checked.
4. ADR metadata: front-matter `Status` is one of `proposed`, `accepted`, `deprecated`, `superseded by ADR-NNNN`, and a superseding ADR exists. No verification or freshness dates.
5. `CLAUDE.md` length: fails above 120 lines (target ~100).
6. Architecture against code: every `src/...` path cited in backticks in any doc in scope exists; every `src/core/<feature>/` and `src/adapters/<technology>/` directory is named in `ARCHITECTURE.md`. The layer rule itself stays with ESLint.
7. Naming: Markdown files at the root and directly under `docs/` are UPPERCASE; files in `docs/` subfolders are lowercase kebab-case; folder indexes are `README.md`; ADRs are `NNNN-kebab-slug.md` with unique numbers and no gaps.
