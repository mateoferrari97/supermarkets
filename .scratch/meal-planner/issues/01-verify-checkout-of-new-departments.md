# 01: Verify Carrefour checkout for the departments search leaves out

**What to build:** Find out whether `OnlineStore.simulate` and `cartLink` work for products of Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería and Aire Libre y Ocio, which planning will search for gifts. Pick a few in-stock products of each department from the Catalog Snapshot, simulate them alone and in one cart in a Branch, open the cart link, and record what Carrefour answers (price, availability, seller, any error). The result decides which departments the `plan` scope searches (spec, Search scope).

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Each department checked with at least three products, simulated alone and together, with the cart link opened
- [x] `docs/references/carrefour-api.md` records what was learned, with the date and the products used
- [x] The list of departments planning may search is written in this ticket's Comments
- [x] No live call is added to any test

## Comments

Done by an agent on 2026-10-16. `simulate` and `cartLink` of `src/adapters/carrefour/carrefour-store.ts` were called live from a one-off script outside the repo, with postal codes 1425 and 1430, for three or four in-stock products of each department, alone and together. Each department's cart link was opened in a logged-in Chrome session (address postal code 1430) and the cart read back with `POST /api/checkout/pub/orderForm`; the account's cart was restored to its earlier content after each link. The products, prices and answers are in [Carrefour API](../../../docs/references/carrefour-api.md#checkout-of-the-departments-orders-leave-out).

What Carrefour answered:

- Every product is sold by seller `1`; no third-party seller appeared.
- With 1430 every product was `available`, and every cart link added every line at quantity 1 with the simulated price.
- With 1425 some products were `cannotBeDelivered` or `withoutPriceFulfillment`, as happens for grocery departments; the flow already drops lines that are not `available`.
- Carrefour splits the cart into "Supermercado" and "Hogar y Electro" carts, paid apart, the second with a $20.000 minimum. Most Electro y tecnología products, tyres, battery cars, garden furniture and bicycles go to "Hogar y Electro"; 62 Hogar products, which orders already search, do too.

Departments planning may search (the `plan` scope): Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería and Aire Libre y Ocio, on top of the departments orders search. None failed `simulate` or `cartLink`. Caveat for tickets 05 and 07: a Plan with a "Hogar y Electro" product leaves the Owner two carts to check out, and that cart refuses checkout under $20.000. The simulation tells such a product apart by its delivery options (reference doc), which the adapter does not read today.

Screenshots of each cart (cropped to the cart panel):

- [Electro y tecnología, split into two carts](../screenshots/01-electro-cart-split.png)
- [Automotor](../screenshots/01-automotor-cart.png)
- [Indumentaria](../screenshots/01-indumentaria-cart.png)
- [Juguetería y Librería](../screenshots/01-jugueteria-libreria-cart.png)
- [Aire Libre y Ocio](../screenshots/01-aire-libre-cart.png)
- [Hogar, mouse and earbuds: the earbuds alone in "Hogar y Electro"](../screenshots/01-mixed-cart-split.png)

No `src/` file and no test changed. The ticket asks for no hand check in `pnpm dev`, so none was run.
