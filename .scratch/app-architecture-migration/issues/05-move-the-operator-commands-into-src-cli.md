# 05: Move the operator commands into src/cli

**What to build:** Every operator command keeps its `pnpm` name and output, but runs from `src/cli/<command>.ts` and reads and writes files only through `compose` loaders and savers in `adapters/files`, and every data loader runs the full validation. The `seed-product-types` and `review-product-type-doubts` skills keep working unchanged. See `.scratch/app-architecture-migration/spec.md` (Operator commands).

**Blocked by:** 03

**Status:** resolved

- [x] `src/cli/` has one file per command: `carrefour:catalog`, `seed:split`, `seed:check-proposal`, `seed:consolidate`, `seed:coverage`, `seed:doubts`, `order:eval`, `product-types`, `payment-cards`, `order:eval-set`; `package.json` runs each through `tsx`. `order` stays in `scripts/order.ts` until 06.
- [x] `src/cli/report.ts` holds the "print errors and exit 1, or print the success line" pattern.
- [x] No file in `src/cli/` imports `node:fs` or `adapters`.
- [x] `src/adapters/files/` replaces `scripts/order-files.ts` and `scripts/seed-files.ts` and is the only place that knows paths and folder layouts; `compose` exposes named loaders and savers.
- [x] Data loaders run the full validation (schema plus cross-references), shared with the validator commands, which become "load and report errors"; tested with invalid data.
- [x] `carrefour:catalog`: download and `summarizeTipos` live in `adapters/carrefour` as `downloadCatalog(outputDir)`; the optional output directory argument stays.
- [x] `order:eval`: `compose` exposes `createOrderResolver({ model? })`; running and scoring one eval case moves to `core/order-resolution` with tests; filters, rendering, comparison with the previous run and `renderItem` stay in `cli`; eval runs are saved and read through `adapters/files`.
- [x] `scripts/` holds only repo tooling (`format.mjs`, `no-comments.ts`, `check-docs.ts` if 04 is done) plus `order.ts`.
- [x] Docs touched are updated (`ARCHITECTURE.md` codemap and Data section, `CLAUDE.md` Commands) if 04 is done.
- [x] `pnpm check` exits 0.

## Comments

- Layout: `src/adapters/files/data-files.ts` exports `createDataFiles(root = ".")`, which holds every path and folder layout of `.data/`, `vocabulary/`, `evals/` and `prompts/`. Loaders return `Checked<T>` (`{ ok: true, value }` or `{ ok: false, errors }`); `loadProductTypes`, `loadPaymentCards` and `loadEvalSet` run the same core validators the old validator scripts ran, and `loadEvalSet` also validates the vocabulary first. `src/compose.ts` re-exports the loaders and savers by name and adds `loadOrderData()`, `createOrderResolver({ model?, onCall? })` and `downloadCatalog(outputDir?, onCategory?)`. `src/cli/report.ts` has `fail`, `report`, `reportChecked` and `valueOf`. `renderItem` moved to `src/cli/render-item.ts`; `scripts/order.ts` imports it and `loadOrderData` until ticket 06.
- Judgment call on `carrefour:catalog`: the ticket asks for `downloadCatalog(outputDir)` in `adapters/carrefour` and also for `adapters/files` to be the only place that knows paths. Both hold this way: `src/adapters/carrefour/catalog-download.ts` exports `downloadCatalog(onCategory)` (download plus `summarizeTipos`) and returns the data; `saveCatalog` in `adapters/files` writes `products.json` and `tipos.json`; `compose.downloadCatalog(outputDir?)` joins them. The optional output directory argument stays.
- `createOrderResolver` also takes `onCall`, because `order:eval` reports sessions and cost per case. It returns the model it used so the report prints it.
- Parts, proposals and doubts are files the seed tooling writes itself. They keep their old handling: parts and doubts are read without a schema, proposals are checked against their part by `validateProposal`, and decisions are parsed with `decisionsSchema`.
- ESLint now also rejects `fs` and `node:fs` imports in `src/cli/` (shown with a probe file that imported `node:fs` and `../adapters/files/data-files.ts`: both imports were reported, then the file was deleted).
- Tests: `src/adapters/files/data-files.test.ts` runs against temporary folders and covers an invalid vocabulary, mapping, Payment Card table and eval set, each failing with the validator's errors, plus the committed data loading cleanly. `src/core/order-resolution/eval-run.test.ts` covers hit, miss and error. `src/adapters/carrefour/catalog-download.test.ts` covers `summarizeTipos`. `scripts/order-files.test.ts` is replaced by the committed-data test.
- Shown to work (2026-10-14): the old commands (HEAD `9494628`) and the new ones ran on two copies of the repo with the same fake Catalog Snapshot. The sequence was product-types, payment-cards, order:eval-set, seed:doubts, seed:coverage, seed:consolidate, seed:split, seed:check-proposal (with no argument, an unknown part, a missing proposal and an invalid proposal), seed:consolidate (with an invalid proposal, missing proposals, invalid decisions and `--partial`), then seed:coverage, seed:doubts with sizes 0 and 2, and order:eval with a filter that matches no case. stdout, stderr and exit codes were identical. `pnpm carrefour:catalog <dir>` ran live against Carrefour into a temporary directory and exited 0 (169 categories, 105446 products, 5483 Tipos). With that snapshot, `seed:split` and `seed:coverage` printed the same output and wrote byte-identical parts under the old and new code (2201 Tipos in 14 parts; 2137 mapped, 64 excluded).
- Not run: `pnpm order:eval` with matching cases, because it makes paid Claude Code calls. Its run loop is covered by `eval-run.test.ts`, and the code path up to the case filter was run.
- `pnpm check` exited 0 on 2026-10-14 (18 test files, 183 tests, and the three data validators).
