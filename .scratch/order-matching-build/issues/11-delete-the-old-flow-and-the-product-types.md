# 11: Delete the old flow and the Product Types

**What to build:** Remove everything the new flow does not use: the old order resolution, Product Types, the vocabulary, live search and sizes read from names, with the docs that describe them.

**Blocked by:** 01, 10

**Status:** resolved

## Decisions (agreed with the Owner)

- Deleted: `src/core/order-resolution/` (whatever is left: `resolve-order.ts`, its concepts and tests), the `split-order`, `resolve-item`, `reword-item` and `map-answer` tasks, their prompts under `prompts/order-resolution/`, their schemas and `renderTree` in `adapters/claude-code`; `vocabulary/product-types.json`, `vocabulary/carrefour-tipos.json`, `src/core/product-types/`, `src/cli/product-types.ts`, the `product-types` script and its step in `pnpm check`; `loadOrderData`'s vocabulary and mapping and the Product Type loaders of `compose` and `adapters/files`; `OnlineStore.findCandidates`, its Carrefour implementation and fixtures, and `snapshotProducts`; `src/core/catalog/` sizes from names (`sizesIn`, `distinctSizes`, brand typo matching) and anything else left unused.
- `GLOSSARY.md` loses Product Type and Product Type Group.
- ADR 0006 keeps its text; ADR 0012 already records the change of ports.

## Acceptance

- [x] `git grep -i "product type\|productType\|tipo mapping\|findCandidates\|split-order\|map-answer"` finds nothing outside ADRs and `.scratch/`.
- [x] `ARCHITECTURE.md` (product, layers, ports, order end to end, Data table), `CLAUDE.md` (Commands and the `pnpm check` steps), `docs/LLM.md`, `docs/TESTING.md` and `docs/references/carrefour-api.md` describe only the new flow.
- [x] One real order in the chat after the deletion; Conversation Log path noted under Comments.
- [x] `pnpm check` exits 0.

## Comments

Built on 2026-10-15 with ticket 10 waived as a blocker by the coordinator: the chat no longer called the old flow after ticket 08, and tickets 09 and 10 are built in parallel.

- Deleted: `src/core/order-resolution/`, `src/core/product-types/`, `src/core/catalog/catalog.ts` and its test, `src/core/product-selection/pick-products.ts` and its test, `src/cli/product-types.ts`, `vocabulary/`, `prompts/order-resolution/`, the old task schemas and `renderTree` in `adapters/claude-code`, `OnlineStore.findCandidates` with its `CandidateQuery`/`StoreProduct`/`SnapshotProduct` types, the Carrefour implementation (facets and product search), `snapshotProducts`, the facets and search fixtures and the unread `simulation-two.json`, `loadProductTypes`, `loadOrderFiles` and the grocery department filter of `adapters/files`, `loadOrderData`, `createOrderResolver` and `DEFAULT_MODEL`, the `product-types` script and its step in `pnpm check`.
- `src/core/catalog/text.ts` moved to `src/core/order-matching/text.ts`; the search adapter and the eval scoring import it there. The `eslint-disable` import of `bm25.ts` went with `resolve-order.ts`.
- The `Llm` port is `src/core/order-matching/llm.ts` with `parseOrder`, `fitProducts` and `readReply` only; `createLlm` takes no vocabulary.
- Tests that used the old tasks or `findCandidates` (Claude Code adapter, Carrefour adapter, Conversation Log, data files) now exercise `parseOrder`, `checkDelivery` and `simulate`. In `take-turn.test.ts` only the fake store's `findCandidates` and the name of one test changed.
- `git grep -i "product type\|productType\|tipo mapping\|findCandidates\|split-order\|map-answer"` outside `docs/adr/` and `.scratch/`: no match.
- `pnpm check` exits 0 (20 test files, 264 tests).

Real order after the deletion, `pnpm dev` with the Catalog Snapshot of 2026-10-15, postal code 1425, order "una yerba playadito de medio kilo, 2 coca cola zero grande, queso port salut light y una bolsa de carbon": cart in 11.1 s (call 1 3.8 s, the four Items' search and call 2 in 6.3 s, simulation 1.0 s). Coca Cola Zero 2,25 l x2, Queso Port Salut Light La Paulina by weight (0.2 kg) with the Note "Tomé \"reducido en grasas\" como light (Carrefour y Silvia).", Carbón vegetal Asados 4 kg. The yerba asked a question, which goes to the block until ticket 09 asks it. Conversation Log: `.data/conversations/2026-10-15-182646-cbbf148d-5bc3-4d29-b665-3fc38e2eb758.jsonl`.
