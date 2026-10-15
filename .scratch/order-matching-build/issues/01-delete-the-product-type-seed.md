# 01: Delete the Product Type seed

**What to build:** Remove the Product Type seed and Carrefour's Tipo summary, which nothing in the order flow reads. After this ticket the repo has no way to build or grow the vocabulary; the vocabulary itself stays until ticket 11 because the current flow still reads it.

**Blocked by:** None (can start immediately). The Payment Card removal of ADR 0011 must be committed first (see the spec's Further Notes).

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Deleted: `src/core/product-type-seed/`, `src/cli/seed-*.ts`, the `seed:*` scripts of `package.json`, the seed I/O of `src/adapters/files/data-files.ts` (`saveConsolidation`, parts, proposals, decisions, doubts, summary and their paths) and its loaders and savers in `src/compose.ts`, the skills `.claude/skills/seed-product-types/` and `.claude/skills/review-product-type-doubts/`, `docs/product-specs/product-type-seed-rules.md` and `.scratch/product-type-seed/`.
- `pnpm carrefour:catalog` no longer writes `tipos.json`: `summarizeTipos`, its types and its tests go; `products.json` is unchanged.
- `docs/product-specs/README.md` stays as the folder index with no documents yet; `CLAUDE.md` stops naming the seed rules as its example.

## Constraints

- No behaviour change to the chat or `pnpm order:eval`.

## Acceptance

- [ ] Nothing under `src/`, `scripts/`, `.claude/` or `docs/` names the seed, its commands, its skills or `tipos.json` (`git grep` shows none outside ADRs and `.scratch/`).
- [ ] `CLAUDE.md` Commands no longer list the `seed:*` commands nor `tipos.json`; `ARCHITECTURE.md` drops `src/core/product-type-seed/`, `.data/carrefour/seed/`, `tipos.json` and the seed from the Data table.
- [ ] `pnpm carrefour:catalog` still writes `products.json` (its tests pass).
- [ ] `pnpm check` exits 0.

## Comments
