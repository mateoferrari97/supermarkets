# 04: Surviving operator scripts

Type: grilling
Status: resolved
Blocked by: 01

## Question

Which operator scripts survive (`carrefour:catalog`, `seed:*`, `order:eval`, `product-types`, `payment-cards`, `order:eval-set`), which are merged or deleted, and how each one becomes a CLI delivery adapter over the use cases of the layers decided in 01, keeping the `seed-product-types` and `review-product-type-doubts` skills working?

## Answer

Decided with the Owner in a grilling session, after reading every file in `scripts/` and both skills. The skills call only `pnpm` commands and `.data/carrefour/seed/` paths, never a file in `scripts/`.

Which commands survive:

- Every operator command survives under its current `pnpm` name, nothing merged: `carrefour:catalog`, `seed:split`, `seed:check-proposal`, `seed:consolidate`, `seed:coverage`, `seed:doubts`, `order:eval`, `product-types`, `payment-cards`, `order:eval-set`. Only `order` is removed (replaced by the chat). The `seed-product-types` and `review-product-type-doubts` skills and `pnpm check` keep working unchanged.
- The validators (`product-types`, `payment-cards`, `order:eval-set`) stay CLI commands run by `pnpm check`, not Vitest tests over committed data: the doubts skill runs `pnpm product-types` on its own after each decision.

Shape of `src/cli/`:

- One file per command, `src/cli/<command>.ts`, run by `package.json` through `tsx`; no subcommand parser, no new dependency.
- A small `src/cli/report.ts` holds the repeated "print errors and exit 1, or print the success line" pattern.
- `cli` uses only the `process` global (`argv`, `exit`, stdout) and never `node:fs`. Every read and write goes through named loaders and savers exposed by `compose` and implemented in `adapters/files` (for example `loadOrderData()`, `saveParts(parts)`, saving and reading eval runs). Paths and the layout of `.data/` and `vocabulary/` live only in `adapters/files`. The dependency rule from 01 stays as decided.

Loading validates:

- The data loaders in `compose` always run the full validation (schema plus cross-references such as unique ids and mappings pointing at existing Product Types), not just the schema parse they run today. The chat and the commands share that one loader, so the chat fails at startup with a clear message instead of mid-order, and each validator command becomes "load and report errors".

Per command:

- `carrefour:catalog`: download and `summarizeTipos` (which writes `tipos.json`) live in `adapters/carrefour`; the command calls `downloadCatalog(outputDir)` through `compose`, keeping the optional output directory argument.
- `order:eval`: `compose` exposes `createOrderResolver({ model? })` wired to Claude Code and the default model; running and scoring one eval case (hit, miss or error) moves to `core/order-resolution` so the app could reuse it; filters, rendering, the comparison with the previous run and `renderItem` stay in `cli`; saving and reading runs moves to `adapters/files`.
- `seed:*` and the validators: thin commands over `core/product-type-seed` and `core/product-types`, with every file read and write through `compose`.
