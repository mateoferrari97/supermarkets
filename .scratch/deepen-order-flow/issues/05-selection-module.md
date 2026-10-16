# 05: Selection module with one price-per-unit rule, shared by chat and eval

**What to build:** One **Selection** module in product-selection chooses Candidates for an Item and ranks them by the Selection Policy. Choosing covers the size rule, the Sale Step, by-weight versus packaged, and ADR 0012's cut of ten by snapshot price per unit. Ranking is savings first, then lowest price per unit, then lowest `itemId` (ADR 0011). One price-per-unit rule is used everywhere: by the size rule (including when it breaks a tie between the most common sizes), by the cut and by the Selection Policy. Prices come from a source: simulation per Candidate in the Branch (the chat) or the snapshot price (the eval set). The eval set's pick uses this module and stops composing its own, so a pass means the chat would pick the same.

**Blocked by:** 04 (Cart returns the Candidate bought per Item)

**Status:** resolved

- [x] A single price-per-unit function replaces the three that exist today
- [x] Selection takes a price source: simulated or snapshot
- [x] The cart uses Selection with simulated prices; the eval set's pick uses it with snapshot prices
- [x] One table of Selection Policy cases runs with both price sources (prior art: `candidates.test.ts`, `selection-policy.test.ts`)
- [x] ADR 0012's cut of ten Candidates is unchanged
- [x] The Owner's cart is unchanged for the same Carrefour answers
- [x] `pnpm check` is green

## Comments

- `candidates.ts` and `selection-policy.ts` merged into `src/core/product-selection/selection.ts`. `pricePerUnit` is the one rule: the size rule's tie between common sizes, the cut of ten and the Selection Policy all use it. `rankCandidates(candidatesPerItem, prices)` takes a `PriceSource`: `simulatedPrices` (the cart, still at most 10 simulations at a time across the order) or `snapshotPrices` (`pickOnSnapshot`, now async, and `orderRunOf`). The Selection Policy table in `selection.test.ts` runs with both sources; savings cases run with the simulated source only, since the snapshot has none. `cart.test.ts` passes unchanged.
