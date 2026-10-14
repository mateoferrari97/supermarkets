# 02: Move the code into core, adapters and compose

**What to build:** Every module in `src/` lands in its layer of ADR 0006 (`src/core/<feature>/`, `src/adapters/<technology>/`, `src/compose.ts`) with the `Llm` and `OnlineStore` ports split out, and behaviour unchanged: every `pnpm` command, including `pnpm order`, works as before, and the existing `scripts/` import the new paths. See `.scratch/app-architecture-migration/spec.md` (Layers and placement).

**Blocked by:** None (can start immediately). Conflicts with 01 on the moved `*.test.ts` files; resolve by hand.

**Status:** ready-for-agent

- [ ] `src/core/catalog/` holds `text.ts` and `catalog.ts`.
- [ ] `src/core/order-resolution/` holds `resolve-order.ts`, `bm25.ts`, `eval-set.ts`, the `Llm` port file and a concepts file (`Item`, `SelectionPolicy`, `Evidence`).
- [ ] `src/core/product-selection/` holds `pick-products.ts`, `payment-cards.ts`, `postal-code.ts`, the `OnlineStore` port file and a concepts file (`PaymentCard`, `Measure`).
- [ ] `src/core/product-types/` and `src/core/product-type-seed/` hold their current files.
- [ ] `src/adapters/claude-code/` holds `claude-code-llm.ts` and the zod schemas that parse LLM output.
- [ ] `src/adapters/carrefour/` holds `carrefour-store.ts`, `snapshotProducts` and the recorded fixtures.
- [ ] `src/compose.ts` exists as the composition root and `scripts/order.ts` gets its `Llm` and `OnlineStore` through it.
- [ ] Each test file sits next to the file it tests; no test is dropped.
- [ ] `pnpm order` and every operator command run unchanged (one manual run of `pnpm product-types`, `pnpm payment-cards` and `pnpm order:eval-set` noted in this ticket).
- [ ] `pnpm check` exits 0.
