# 05: Docs layout

Type: grilling
Status: resolved
Blocked by: none

## Question

Which folders and top-level docs of the harness-engineering layout apply here (design-docs, exec-plans, product-specs, references, generated, `ARCHITECTURE.md`, `QUALITY_SCORE.md`, ...), where do the current `docs/adr/`, `docs/agents/` and `docs/product-type-seed-rules.md` go, what does the ~100-line `CLAUDE.md` map contain, and what is the rule for promoting knowledge from `.scratch/` into `docs/`?

## Answer

Content first: each doc exists because it holds knowledge an agent needs to work in the repo; harness-engineering files with nothing to hold are not created.

Layout:

- `CLAUDE.md` (~100 lines): current rules (Language, No comments, Accuracy, GitHub, Before every push, Agent skills) plus a **Map** section (one-line pointers to `ARCHITECTURE.md`, `GLOSSARY.md`, `docs/adr/README.md`, `docs/PLANS.md` and `docs/exec-plans/active/`, `docs/product-specs/`, `docs/references/`, `docs/LLM.md`, `docs/TESTING.md`, `.scratch/`), a **Commands** section (`pnpm dev`, `pnpm check`, `pnpm test`, every operator command) replacing "Catalog data", a short **Workflow** section (wayfinder map, spec in `.scratch/`, tickets, ADRs and glossary, exec plan) and a **File naming** section (below). Detail lives in the pointed-to docs, never in `CLAUDE.md`.
- `ARCHITECTURE.md` at the repo root: what the product is (one paragraph: the Owner's free-text order becomes a Carrefour cart the Owner opens and pays); layers, ports and the dependency rule from [Layers and dependency rule](01-layers-and-dependency-rule.md); a codemap of an order end to end (postal code, Branch, split, resolve Items, questions, Selection Policy, live search and simulation, pick) naming the module of each step; a **Data** section on `vocabulary/`, `evals/`, `prompts/` and `.data/` (what each is, who writes it, who validates it, committed or not).
- `GLOSSARY.md` stays at the root and `docs/agents/` stays as is: the mattpocock skills hard-code those paths (`code-review/SKILL.md:13`, `domain-modeling`).
- `docs/adr/` stays the design-docs folder, with a `docs/adr/README.md` index. No `docs/design-docs/`, no separate core-beliefs.
- `docs/PLANS.md` and `docs/exec-plans/active/`, `docs/exec-plans/completed/`. Contents of `PLANS.md` belong to [Exec plan conventions](09-exec-plan-conventions.md).
- `docs/product-specs/`: `docs/product-type-seed-rules.md` moves to `docs/product-specs/product-type-seed-rules.md`.
- `docs/LLM.md`: LLM translates, code decides (ADR 0002); where prompts live; how to change a prompt and measure it with `order:eval`.
- `docs/TESTING.md`: Vitest, recorded fixtures under `src/*/fixtures/`, no live calls in tests, the eval set apart from tests.
- `docs/references/carrefour-api.md`: Carrefour endpoints (search, facets, simulation, regions), quirks and fixtures, summarised from `.scratch/carrefour-cart/research/` as a build ticket of the exec plan.

Not created: `docs/design-docs/`, `docs/generated/`, `tech-debt-tracker.md` (debt is a `.scratch/` issue), `QUALITY_SCORE.md` (repeats `pnpm check` for one dev), `DESIGN.md`, `FRONTEND.md` (created at the chat's first UI convention), `PRODUCT_SENSE.md`, `RELIABILITY.md`, `SECURITY.md` (local only).

`.scratch/` and `docs/`:

- No promotion rule: specs, research history and debt stay in `.scratch/`; the closed specs (order-resolution, postal-code, product-selection, product-type-seed) stay there.
- Nothing stable links into `.scratch/`: not `docs/`, not `CLAUDE.md`, not code. `.scratch/` can be deleted at any time.
- Exception by kind, not by promotion: facts about external systems the code depends on go to `docs/references/`.
- `GLOSSARY.md` and ADRs keep being written during the work, as today.

File naming: top-level Markdown docs (repo root and directly under `docs/`) are UPPERCASE: `CLAUDE.md`, `ARCHITECTURE.md`, `GLOSSARY.md`, `docs/PLANS.md`, `docs/LLM.md`, `docs/TESTING.md`. Docs inside subfolders (`docs/adr/`, `docs/agents/`, `docs/product-specs/`, `docs/references/`, `docs/exec-plans/`) and everything under `.scratch/` stay lowercase kebab-case; folder indexes are `README.md`.

## Comments

Amended by [Mechanical docs checks](07-mechanical-docs-checks.md): no exec plans, so `docs/PLANS.md`, `docs/exec-plans/active/` and `docs/exec-plans/completed/` are not created and leave the `CLAUDE.md` Map; the Workflow section of `CLAUDE.md` ends at the spec and tickets in `.scratch/`.
