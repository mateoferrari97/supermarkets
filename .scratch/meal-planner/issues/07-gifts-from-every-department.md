# 07: Gifts from every department

**What to build:** "Un regalo para mi vieja, le gusta cocinar, hasta $30.000" gets gift ideas, each with its reason, from any department ticket 01 approved, with no servings. `CatalogSearch.findMatches` takes a scope: `order` keeps today's excluded departments, `plan` searches every in-stock product of the approved departments. Planning searches with `plan`; orders never see the new departments.

**Blocked by:** 01, 04

**Status:** resolved

- [x] The port and the in-memory adapter take the scope; every order caller passes `order`
- [x] Tests: `order` still leaves out the excluded departments; `plan` returns a product of an approved one and never one without stock
- [x] `prompts/planning/plan.md` gains the gift example
- [x] Checked by hand in `pnpm dev` with one gift request confirmed into a cart; screenshot in Comments
- [x] `ARCHITECTURE.md` describes the two scopes
- [x] `pnpm check` is green

## Comments

Decision of 2026-10-16 (Owner): ticket 01 approved all five departments. Products Carrefour puts in the separate "Hogar y Electro" cart are allowed in Plans with no warning and no special handling; detecting or warning about that cart is left to a future ticket.

Done by an agent on 2026-10-16.

- `CatalogSearch.findMatches(item, scope, limit)` takes a required `SearchScope` (`"order" | "plan"`, `src/core/order-matching/catalog-search.ts`). The in-memory adapter keeps `EXCLUDED_DEPARTMENTS` for `order` and searches every in-stock product for `plan`, which adds the five departments ticket 01 approved; it builds one index per scope the first time that scope is searched, so the ranking of an order is the same as before. `matchItems` and `pnpm order:label` pass `order`; `planWithSearches` passes `plan`; `loggedSearch` passes the scope through.
- Tests: `in-memory-catalog-search.test.ts` checks that `order` leaves out the excluded departments and products without stock, that `plan` returns a product of each approved department, and that `plan` never returns a product without stock. `plan-searches.test.ts` checks that each query runs in scope `plan`, and `match-items.test.ts` that each Item is searched in scope `order`.
- `prompts/planning/plan.md` gains a gift example ("un regalo para mi vieja, le gusta cocinar, hasta $30.000") with one Idea section per gift and its reason, no servings, and lines within the budget, plus rules for gifts and for keeping the snapshot total within a budget the Owner gives.
- `ARCHITECTURE.md` describes the two scopes under the `CatalogSearch` port and in the order and Plan flows; `docs/LLM.md` says the search loop uses scope `plan`.
- `pnpm check` exits 0.

Hand check in `pnpm dev` (port 3700, postal code 1430):

- [Gift for mom](../screenshots/07-gift-plan-for-mom.png): "Un regalo para mi vieja, le gusta cocinar, hasta $30.000" searched eight queries in one round and got a Plan with two gift ideas, each with its reason, at $23.900. The Conversation Log shows the searches returned products of Juguetería y Librería and Electro y tecnología (for "libro de recetas" and "batidora de mano"); the planner chose two Hogar products. Asked to swap the knife for a hand mixer, it said every mixer found was over the budget.
- [Gift for a nephew](../screenshots/07-gift-plan-jugueteria.png): "Un regalo para mi sobrino de 8 años, le gustan los dinosaurios y dibujar, hasta $25.000" got a Plan of four products, all of Juguetería y Librería and in stock in the Catalog Snapshot (`771131`, `768390`, `735325`, `750699`), at $24.200.

Confirmed into a cart on 2026-10-16, after tickets 05 and 07 were merged into main (`6409fd5`), in `pnpm dev` on port 3700 with postal code 1430:

- [Gift confirmed into a cart](../screenshots/07-gift-confirmed-cart.png): "un regalo para mi vieja, le gusta cocinar, hasta $30.000" got a Plan of two Hogar products (Tabla de madera Suka acacia, Cuchillo de cocina 6"), each with its reason, at $23.900. The "Confirmar" chip sent "Confirmo"; the turn simulated the cart and showed the Idea above the table, both lines available at $23.900 for CP 1430, the warning to empty the Carrefour cart and the cart link. Each line's `original` names its purpose ("— regalo para mamá").
- Observation, not a bug of this ticket: each cart line's reason reads "Es el único disponible entre los candidatos.", the Selection Policy's reason for an Item with one Candidate, not the Plan Line's reason. The spec does not say which one the cart shows.
