# 05: Handle unavailable products and changed prices

**What to build:** When checkout says a picked product is unavailable, it is replaced by the other Candidate of its Item and the Owner is told; when search finds no Candidate, products of the Catalog Snapshot of the same Tipos are tried through simulation; an Item that still has nothing is reported as not filled; a price that changed in the final simulation is kept and shown. See `.scratch/product-selection/spec.md` (Candidates, Final check).

**Blocked by:** 01

**Status:** resolved

- [x] A Candidate that is not `available` in its own simulation is never picked.
- [x] A product that is not `available` in the final simulation is replaced by the other Candidate and the cart is simulated again, with a notice.
- [x] With no Candidate from search, Catalog Snapshot products of the Item's Tipos are simulated, two at a time, until one is available.
- [x] An Item with no available product is reported as not filled and left out of the total.
- [x] A final price different from the Candidate's simulation is shown as the final one.
- [x] Tested through `pickProducts` with fake ports.
- [x] `pnpm check` exits 0.

## Comments

The final cart is simulated, and every product unavailable there moves its Item to its next ranked Candidate; the cart is simulated again until all are available or the Item has none left, which is reported as not filled. Final lines are matched to Items by position, so two Items with the same product each keep their own quantity. A final price different from the Candidate's simulation is shown with a notice.

With no Candidate from search, the Catalog Snapshot (`snapshotProducts` in the Carrefour adapter, in-stock products first) is filtered by the Item's Tipos, strict brands, excluded brands and terms, and simulated two at a time, up to 10, until one is available. Snapshot products have no weight step or teasers, so a weighed product found only there is bought by unit.
