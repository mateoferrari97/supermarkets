# 01: Verify Carrefour checkout for the departments search leaves out

**What to build:** Find out whether `OnlineStore.simulate` and `cartLink` work for products of Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería and Aire Libre y Ocio, which planning will search for gifts. Pick a few in-stock products of each department from the Catalog Snapshot, simulate them alone and in one cart in a Branch, open the cart link, and record what Carrefour answers (price, availability, seller, any error). The result decides which departments the `plan` scope searches (spec, Search scope).

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] Each department checked with at least three products, simulated alone and together, with the cart link opened
- [ ] `docs/references/carrefour-api.md` records what was learned, with the date and the products used
- [ ] The list of departments planning may search is written in this ticket's Comments
- [ ] No live call is added to any test

## Comments
