# 07: Fate of Product Types and the seed

Type: grilling
Status: resolved
Blocked by: 03

## Question

Once the search is settled, which of these does the new flow still use, and which are deleted: `vocabulary/product-types.json`, `vocabulary/carrefour-tipos.json`, `src/core/product-types/`, `src/core/product-type-seed/`, the `seed:*` and `product-types` commands, the `seed-product-types` and `review-product-type-doubts` skills, `docs/product-specs/product-type-seed-rules.md`, and the Product Type and Product Type Group glossary terms? Does the Tipo mapping still earn its place as a filter of non-grocery products?

## Comments

- From [Search for Matches](03-search-for-matches.md): the search filters non-grocery products by department, not by the Tipo mapping, so the mapping is not needed as a filter.

## Answer

Agreed with the Owner on 2026-10-15.

- **Product Types leave the domain.** The new flow goes from Item to Matches (search over `name`, `brand` and `tipo` of the Catalog Snapshot) to Fits (call 2) and never uses a Product Type. Everything listed in the question is deleted; nothing is kept as dead data. Git keeps the history.
- **Two build slices, at both ends of the build.**
  - **Seed slice, first.** Nothing in the order flow imports it, so it goes before the new flow: `src/core/product-type-seed/`, the `src/cli/seed-*.ts` commands and the `seed:*` scripts, the seed I/O in `src/adapters/files/data-files.ts` (`saveConsolidation` and the proposal and decision files), the `seed-product-types` and `review-product-type-doubts` skills, `docs/product-specs/product-type-seed-rules.md` and its index line, and `.scratch/product-type-seed/`. The same slice drops `summarizeTipos` and `.data/carrefour/tipos.json` from `pnpm carrefour:catalog` (no code reads it; the search reads `tipo` from `products.json`) and the `CLAUDE.md` line that names it.
  - **Vocabulary slice, last.** The current flow reads the vocabulary (`loadOrderData` in `src/compose.ts`, `resolve-order.ts`, `pick-products.ts`, `renderTree` in `claude-code-llm.ts`, `eval-set.ts`, `eval-run.ts`, `render-item.ts`), so it goes with `split-order`, `resolve-item`, `reword-item` and `map-answer`: `vocabulary/product-types.json`, `vocabulary/carrefour-tipos.json`, `src/core/product-types/`, `src/cli/product-types.ts`, the `product-types` script and its step in `pnpm check`.
- **No Tipo mapping as a filter.** Non-grocery products are filtered by the list of excluded departments of [Search for Matches](03-search-for-matches.md). If the new eval set shows non-grocery Matches, the list grows; the mapping does not come back.
- **ADRs.** The new ADR supersedes ADR 0001 (own Product Types mapped from each online store) as well as ADR 0003, and amends ADRs 0004 and 0005. ADR 0006 only uses Product Types as an example of a feature; the vocabulary slice fixes the example, no ADR needed. ADR 0003 line 11 (the LLM proposes from `tipos.json`) is already stale and is superseded anyway.
- **Glossary.** Product Type and Product Type Group are removed in the vocabulary slice, while code still uses them they stay. No new term for Carrefour's `tipo`: it is a field of an external system and is described in `docs/references/carrefour-api.md`.
- **Docs touched by the vocabulary slice.** `ARCHITECTURE.md`, `CLAUDE.md` (Commands and `pnpm check`), `docs/LLM.md`, `docs/TESTING.md`, `docs/references/carrefour-api.md`, `docs/adr/README.md`.
