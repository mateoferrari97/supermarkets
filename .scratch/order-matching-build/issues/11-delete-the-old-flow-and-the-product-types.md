# 11: Delete the old flow and the Product Types

**What to build:** Remove everything the new flow does not use: the old order resolution, Product Types, the vocabulary, live search and sizes read from names, with the docs that describe them.

**Blocked by:** 01, 10

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Deleted: `src/core/order-resolution/` (whatever is left: `resolve-order.ts`, its concepts and tests), the `split-order`, `resolve-item`, `reword-item` and `map-answer` tasks, their prompts under `prompts/order-resolution/`, their schemas and `renderTree` in `adapters/claude-code`; `vocabulary/product-types.json`, `vocabulary/carrefour-tipos.json`, `src/core/product-types/`, `src/cli/product-types.ts`, the `product-types` script and its step in `pnpm check`; `loadOrderData`'s vocabulary and mapping and the Product Type loaders of `compose` and `adapters/files`; `OnlineStore.findCandidates`, its Carrefour implementation and fixtures, and `snapshotProducts`; `src/core/catalog/` sizes from names (`sizesIn`, `distinctSizes`, brand typo matching) and anything else left unused.
- `GLOSSARY.md` loses Product Type and Product Type Group.
- ADR 0006 keeps its text; ADR 0012 already records the change of ports.

## Acceptance

- [ ] `git grep -i "product type\|productType\|tipo mapping\|findCandidates\|split-order\|map-answer"` finds nothing outside ADRs and `.scratch/`.
- [ ] `ARCHITECTURE.md` (product, layers, ports, order end to end, Data table), `CLAUDE.md` (Commands and the `pnpm check` steps), `docs/LLM.md`, `docs/TESTING.md` and `docs/references/carrefour-api.md` describe only the new flow.
- [ ] One real order in the chat after the deletion; Conversation Log path noted under Comments.
- [ ] `pnpm check` exits 0.

## Comments
