# 01: Delete the Product Type seed

**What to build:** Remove the Product Type seed and Carrefour's Tipo summary, which nothing in the order flow reads. After this ticket the repo has no way to build or grow the vocabulary; the vocabulary itself stays until ticket 11 because the current flow still reads it.

**Blocked by:** None (can start immediately). The Payment Card removal of ADR 0011 must be committed first (see the spec's Further Notes).

**Status:** resolved

## Decisions (agreed with the Owner)

- Deleted: `src/core/product-type-seed/`, `src/cli/seed-*.ts`, the `seed:*` scripts of `package.json`, the seed I/O of `src/adapters/files/data-files.ts` (`saveConsolidation`, parts, proposals, decisions, doubts, summary and their paths) and its loaders and savers in `src/compose.ts`, the skills `.claude/skills/seed-product-types/` and `.claude/skills/review-product-type-doubts/`, `docs/product-specs/product-type-seed-rules.md` and `.scratch/product-type-seed/`.
- `pnpm carrefour:catalog` no longer writes `tipos.json`: `summarizeTipos`, its types and its tests go; `products.json` is unchanged.
- `docs/product-specs/README.md` stays as the folder index with no documents yet; `CLAUDE.md` stops naming the seed rules as its example.

## Constraints

- No behaviour change to the chat or `pnpm order:eval`.

## Acceptance

- [x] Nothing under `src/`, `scripts/`, `.claude/` or `docs/` names the seed, its commands, its skills or `tipos.json` (`git grep` shows none outside ADRs and `.scratch/`).
- [x] `CLAUDE.md` Commands no longer list the `seed:*` commands nor `tipos.json`; `ARCHITECTURE.md` drops `src/core/product-type-seed/`, `.data/carrefour/seed/`, `tipos.json` and the seed from the Data table.
- [x] `pnpm carrefour:catalog` still writes `products.json` (its tests pass).
- [x] `pnpm check` exits 0.

## Comments

- Deleted `src/core/product-type-seed/`, the five `src/cli/seed-*.ts`, the `seed:*` scripts, the two seed skills, `docs/product-specs/product-type-seed-rules.md` and `.scratch/product-type-seed/`; the seed I/O (`saveParts`, `loadParts`, `loadPart`, `hasProposal`, `loadProposal`, `loadDecisions`, `loadDoubts`, `saveConsolidation` and their paths) left `data-files.ts` and `compose.ts`.
- `GROCERY_DEPARTMENTS` lived in `split.ts` but `loadOrderFiles` still filters the catalog with it, so the list moved unchanged into `data-files.ts` as a private constant; the order flow is unchanged. Ticket 03 replaces it with the search's excluded departments.
- `downloadCatalog` no longer builds Tipo summaries and `saveCatalog` writes only `products.json`; `meta.distinctTipos` is now counted from the products directly. `catalog-download.test.ts` only tested `summarizeTipos`, so it went; the `saveCatalog` tests in `data-files.test.ts` now check that `products.json` is the only file written. `pnpm carrefour:catalog` was not run live (it downloads the whole catalog).
- `git grep -i -E "seed|tipos\.json|summarizeTipos"` outside `docs/adr/` and `.scratch/` only hits `vocabulary/carrefour-tipos.json`, the Tipo mapping that stays until ticket 11.
- The `vocabulary/` row of the Data table now says the files are written by hand, since no command writes them any more.
- `pnpm check` exits 0: 13 test files, 164 tests.
