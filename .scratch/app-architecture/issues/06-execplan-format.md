# 06: ExecPlan format

Type: research
Status: resolved
Blocked by: none

## Question

What is OpenAI's exec plan format (`PLANS.md`, execution plans with progress and decision logs) and the harness-engineering knowledge-base layout as published, and which parts fit this repo's exec plans and design docs? Cite primary sources.

## Answer

Findings on branch `research/execplan-format-petrel` (`.scratch/app-architecture/research/execplan-format.md`); a second, agreeing note is on `research/execplan-format`.

- ExecPlan format (OpenAI cookbook, "Using PLANS.md for multi-hour problem solving", 2025-10-07, https://github.com/openai/openai-cookbook/blob/main/articles/codex_exec_plans.md): one self-contained, living, prose-first Markdown plan that a newcomer can execute with only the plan and the repo. Four mandatory living sections: `Progress` (timestamped checkboxes), `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`. Skeleton: Purpose, Context and Orientation, Plan of Work, Concrete Steps, Validation and Acceptance, Idempotence and Recovery, Artifacts and Notes, Interfaces and Dependencies. Milestones are independently verifiable. The cookbook registry marks the article `archived: true`; why is unknown.
- Harness-engineering layout (OpenAI, 2026-02-11, https://openai.com/index/harness-engineering/, read via Wayback): ~100-line `AGENTS.md` as table of contents; `ARCHITECTURE.md`; `docs/` with `design-docs/` (index, core-beliefs, verification status), `exec-plans/active|completed/` plus `tech-debt-tracker.md`, `generated/`, `product-specs/`, `references/`, and `DESIGN.md`, `FRONTEND.md`, `PLANS.md`, `PRODUCT_SENSE.md`, `QUALITY_SCORE.md`, `RELIABILITY.md`, `SECURITY.md`. Linters and CI check freshness and cross-links; a doc-gardening agent opens fix-ups.
- Not published (unknown): OpenAI's internal `PLANS.md`, templates for `QUALITY_SCORE.md`, `tech-debt-tracker.md`, `core-beliefs.md`, verification status, and what the doc linters check.
- Fits as-is: the skeleton and four living sections, `docs/PLANS.md` pointed to from `CLAUDE.md`, `active/` and `completed/`, milestones accepted by `pnpm check` exiting 0, old and new delivery running side by side during migration, a matklad-style `ARCHITECTURE.md`.
- Needs a decision: self-containment versus citing ADRs and `GLOSSARY.md` (suggest: allow in-repo `docs/` paths with a one-line restatement, never cite `.scratch/`); "resolve ambiguities autonomously" versus the accuracy rule and grilling; `Decision Log` versus ADRs (suggest: log in the plan, promote lasting decisions to ADRs); milestones versus `.scratch/` build tickets (which one owns status).

## Comments

Not adopted: [Mechanical docs checks](07-mechanical-docs-checks.md) chose `.scratch/` specs and tickets over the ExecPlan format. The findings stay as context.
