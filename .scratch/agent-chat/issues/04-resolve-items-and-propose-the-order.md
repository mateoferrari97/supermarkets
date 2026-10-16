# 04: The agent resolves Items and proposes the Order

**What to build:** The Owner writes what to buy and the agent shows a proposal card: each Item with the product code picked. `resolveItem` searches the Catalog Snapshot, keeps the Fits with call 2 and lets the Selection Policy pick after simulation in the Branch, with no question. An Item with no Fit is left out of the proposal with a Note. The proposal belongs to an open Order, which opens with the first message about something to buy.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] `resolveItem` returns picked when something fits and none otherwise, with the same products as today's order flow for the same Item (tests with fakes)
- [ ] The proposal card lists each Item, its product, quantity and price
- [ ] The agent never names a product no tool returned
- [ ] `pnpm check` is green

## Comments
