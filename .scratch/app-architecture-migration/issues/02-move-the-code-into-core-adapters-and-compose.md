# 02: Move the code into core, adapters and compose

**What to build:** Every module in `src/` lands in its layer of ADR 0006 (`src/core/<feature>/`, `src/adapters/<technology>/`, `src/compose.ts`) with the `Llm` and `OnlineStore` ports split out, and behaviour unchanged: every `pnpm` command, including `pnpm order`, works as before, and the existing `scripts/` import the new paths. See `.scratch/app-architecture-migration/spec.md` (Layers and placement).

**Blocked by:** None (can start immediately). Conflicts with 01 on the moved `*.test.ts` files; resolve by hand.

**Status:** resolved

- [x] `src/core/catalog/` holds `text.ts` and `catalog.ts`.
- [x] `src/core/order-resolution/` holds `resolve-order.ts`, `bm25.ts`, `eval-set.ts`, the `Llm` port file and a concepts file (`Item`, `SelectionPolicy`, `Evidence`).
- [x] `src/core/product-selection/` holds `pick-products.ts`, `payment-cards.ts`, `postal-code.ts`, the `OnlineStore` port file and a concepts file (`PaymentCard`, `Measure`).
- [x] `src/core/product-types/` and `src/core/product-type-seed/` hold their current files.
- [x] `src/adapters/claude-code/` holds `claude-code-llm.ts` and the zod schemas that parse LLM output.
- [x] `src/adapters/carrefour/` holds `carrefour-store.ts`, `snapshotProducts` and the recorded fixtures.
- [x] `src/compose.ts` exists as the composition root and `scripts/order.ts` gets its `Llm` and `OnlineStore` through it.
- [x] Each test file sits next to the file it tests; no test is dropped.
- [x] `pnpm order` and every operator command run unchanged (one manual run of `pnpm product-types`, `pnpm payment-cards` and `pnpm order:eval-set` noted in this ticket).
- [x] `pnpm check` exits 0.

## Comments

- Port and concepts files: `src/core/order-resolution/llm.ts` (the `Llm` port with its input and output types) and `src/core/order-resolution/concepts.ts` (`Item`, `SelectionPolicy`, `Evidence`, `DEFAULT_SELECTION_POLICY`); `src/core/product-selection/online-store.ts` (the `OnlineStore` port, renamed from `store.ts`) and `src/core/product-selection/concepts.ts` (`PaymentCard`, `Measure`). The core types are now plain TypeScript types; the zod schemas that parse LLM output live in `src/adapters/claude-code/llm-output-schemas.ts`, each typed as `z.ZodType<PortType>`, so `pnpm typecheck` fails if a schema and its port type drift apart.
- `snapshotProducts` already lived in `carrefour-store.ts`, so it moved with it to `src/adapters/carrefour/`, together with `fixtures/`.
- `src/compose.ts` exposes `createLlm(options)` and `createOnlineStore()`; `scripts/order.ts` uses only those. The other scripts still import adapters directly (`order-eval.ts`, `order-files.ts`); ticket 05 moves them behind `compose`.
- Tests: 14 test files and 135 tests before and after the move (counted on `def8bca` and on this change; `pnpm test`: "Test Files 14 passed (14), Tests 135 passed (135)").
- Manual runs on 2026-10-14, with `.data/` copied from the main checkout (it is not committed):
  - `pnpm product-types`: "Product Type vocabulary and Carrefour mapping are valid".
  - `pnpm payment-cards`: "Payment Card table is valid".
  - `pnpm order:eval-set`: "Order resolution eval set is valid".
  - `pnpm order:eval dos-cocas-grandes`: "1/1 hits, 0 misses, 0 errors", "no outcome changed", 2 Claude Code sessions.
  - `pnpm order --postal-code 1425 "dos cocas grandes"`, answering `6` (2,25 l): cart with "Gaseosa cola Coca Cola sabor original 2,25 lts (3807) x2", total $9000.00 and the cart link; 3 Claude Code sessions.
  - `pnpm order --postal-code xyz "leche"` with `abc` then end of input: both refusals ("no es un código postal válido") and "Sin código postal no puedo armar el pedido.", exit 1.
  - `pnpm seed:split` (2203 Tipos in 14 parts, parts identical to the main checkout's), `pnpm seed:check-proposal almacen-1` (valid, 194 Tipos), `pnpm seed:consolidate` (rewrote `vocabulary/product-types.json` and `vocabulary/carrefour-tipos.json` with no git diff), `pnpm seed:coverage` (2139 mapped, 64 excluded, 0 in doubt, 0 unreviewed), `pnpm seed:doubts` ("No remaining doubts").
  - Not run: `pnpm carrefour:catalog`, which downloads the whole Carrefour catalog; `scripts/carrefour-catalog.ts` imports nothing from `src/` and is not changed by this ticket.
