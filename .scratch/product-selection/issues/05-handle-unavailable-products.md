# 05: Handle unavailable products and changed prices

**What to build:** When checkout says a picked product is unavailable, it is replaced by the other Candidate of its Item and the Owner is told; when search finds no Candidate, products of the Catalog Snapshot of the same Tipos are tried through simulation; an Item that still has nothing is reported as not filled; a price that changed in the final simulation is kept and shown. See `.scratch/product-selection/spec.md` (Candidates, Final check).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A Candidate that is not `available` in its own simulation is never picked.
- [ ] A product that is not `available` in the final simulation is replaced by the other Candidate and the cart is simulated again, with a notice.
- [ ] With no Candidate from search, Catalog Snapshot products of the Item's Tipos are simulated, two at a time, until one is available.
- [ ] An Item with no available product is reported as not filled and left out of the total.
- [ ] A final price different from the Candidate's simulation is shown as the final one.
- [ ] Tested through `pickProducts` with fake ports.
- [ ] `pnpm check` exits 0.
