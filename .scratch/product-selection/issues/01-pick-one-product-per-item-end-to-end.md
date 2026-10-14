# 01: Pick one product per Item end to end on live Carrefour

**What to build:** The Owner runs `pnpm order "<text> envío a 1425"`, answers the questions, and gets one product per Item picked from live Carrefour with promotions first: product, quantity, unit price, subtotal, the reason, and the order total. The postal code comes from the order, and is asked when missing. Each Item's Candidates come from Intelligent Search v1 in the Owner's region (Tipos mapped to its Product Types, available only, the Item's brand when it has one, sorted by discount); the first two are simulated one by one and code picks with savings first, then price per unit, then `itemId`; the chosen cart is simulated once more. See `.scratch/product-selection/spec.md` and ADR 0005.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `split-order` also returns the order's postal code (nullable); a missing one becomes a question in the questions message and is applied through `answerQuestions`.
- [ ] `pickProducts(resolution, dependencies)` returns the Product Selection, with the search, simulation and LLM ports injected.
- [ ] The search adapter resolves the postal code to a `regionId`, reads `tipo-de-producto` and `brand` slugs from the facets endpoint, and lists available products of the Item's Tipos sorted by `discount:desc`, sending `page` with `count`.
- [ ] A brand on the Item restricts the search to that brand.
- [ ] Each of the two Candidates is simulated alone with `RnbBehavior=0`, the postal code and seller `"1"`; prices come from `priceDefinition`, savings from `priceTags`, the reason from `rateAndBenefitsIdentifiers`.
- [ ] Code picks: a Candidate with savings first, then lowest price per unit of measure (price per package when the measure is unknown), then lowest `itemId`; an Item with several Product Types is picked among all of them.
- [ ] The chosen products are simulated together and the shown prices and total come from that simulation.
- [ ] The adapters are tested with recorded Carrefour responses through an injected HTTP client; `pickProducts` is tested with fake ports; `pnpm check` never calls Carrefour.
- [ ] A real run of "dos cocas de 2,25 y yerba, envío a 1425" prints a product per Item with its reason, and is recorded in this ticket.
- [ ] `pnpm check` exits 0.
