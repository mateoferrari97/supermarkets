# 05: Move the operator commands into src/cli

**What to build:** Every operator command keeps its `pnpm` name and output, but runs from `src/cli/<command>.ts` and reads and writes files only through `compose` loaders and savers in `adapters/files`, and every data loader runs the full validation. The `seed-product-types` and `review-product-type-doubts` skills keep working unchanged. See `.scratch/app-architecture-migration/spec.md` (Operator commands).

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `src/cli/` has one file per command: `carrefour:catalog`, `seed:split`, `seed:check-proposal`, `seed:consolidate`, `seed:coverage`, `seed:doubts`, `order:eval`, `product-types`, `payment-cards`, `order:eval-set`; `package.json` runs each through `tsx`. `order` stays in `scripts/order.ts` until 06.
- [ ] `src/cli/report.ts` holds the "print errors and exit 1, or print the success line" pattern.
- [ ] No file in `src/cli/` imports `node:fs` or `adapters`.
- [ ] `src/adapters/files/` replaces `scripts/order-files.ts` and `scripts/seed-files.ts` and is the only place that knows paths and folder layouts; `compose` exposes named loaders and savers.
- [ ] Data loaders run the full validation (schema plus cross-references), shared with the validator commands, which become "load and report errors"; tested with invalid data.
- [ ] `carrefour:catalog`: download and `summarizeTipos` live in `adapters/carrefour` as `downloadCatalog(outputDir)`; the optional output directory argument stays.
- [ ] `order:eval`: `compose` exposes `createOrderResolver({ model? })`; running and scoring one eval case moves to `core/order-resolution` with tests; filters, rendering, comparison with the previous run and `renderItem` stay in `cli`; eval runs are saved and read through `adapters/files`.
- [ ] `scripts/` holds only repo tooling (`format.mjs`, `no-comments.ts`, `check-docs.ts` if 04 is done) plus `order.ts`.
- [ ] Docs touched are updated (`ARCHITECTURE.md` codemap and Data section, `CLAUDE.md` Commands) if 04 is done.
- [ ] `pnpm check` exits 0.
