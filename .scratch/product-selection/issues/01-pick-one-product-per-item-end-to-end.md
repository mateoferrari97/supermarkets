# 01: Pick one product per Item end to end on live Carrefour

**What to build:** The Owner runs `pnpm order "<text> envío a 1425"`, answers the questions, and gets one product per Item picked from live Carrefour with promotions first: product, quantity, unit price, subtotal, the reason, and the order total. The postal code comes from the order, and is asked when missing. Each Item's Candidates come from Intelligent Search v1 in the Owner's region (Tipos mapped to its Product Types, available only, the Item's brand when it has one, sorted by discount); the first two are simulated one by one and code picks with savings first, then price per unit, then `itemId`; the chosen cart is simulated once more. See `.scratch/product-selection/spec.md` and ADR 0005.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `split-order` also returns the order's postal code (nullable); a missing one becomes a question in the questions message and is applied through `answerQuestions`.
- [x] `pickProducts(resolution, dependencies)` returns the Product Selection, with the search, simulation and LLM ports injected.
- [x] The search adapter resolves the postal code to a `regionId`, reads `tipo-de-producto` and `brand` slugs from the facets endpoint, and lists available products of the Item's Tipos sorted by `discount:desc`, sending `page` with `count`.
- [x] A brand on the Item restricts the search to that brand.
- [x] Each of the two Candidates is simulated alone with `RnbBehavior=0`, the postal code and seller `"1"`; prices come from `priceDefinition`, savings from `priceTags`, the reason from `rateAndBenefitsIdentifiers`.
- [x] Code picks: a Candidate with savings first, then lowest price per unit of measure (price per package when the measure is unknown), then lowest `itemId`; an Item with several Product Types is picked among all of them.
- [x] The chosen products are simulated together and the shown prices and total come from that simulation.
- [x] The adapters are tested with recorded Carrefour responses through an injected HTTP client; `pickProducts` is tested with fake ports; `pnpm check` never calls Carrefour.
- [x] A real run of "dos cocas de 2,25 y yerba, envío a 1425" prints a product per Item with its reason, and is recorded in this ticket.
- [x] `pnpm check` exits 0.

## Comments

`split-order` returns `postalCode` (the first four digits of what the Owner wrote, so "C1425ABC" is 1425); a missing one is asked last in the questions message ("¿A qué código postal es el envío?") and answered through `map-answer` as `rephrased`. `OrderResolution` carries `postalCode`.

`src/product-selection/` holds the `OnlineStore` port (`findCandidates`, `simulate`), its Carrefour adapter (`createCarrefourStore`, over an injectable HTTP client) and `pickProducts`. The adapter resolves the postal code to a `regionId`, reads each Tipo's `tipo-de-producto` slug from the facets of a search for the Tipo's name and the brand slug from the facets of those Tipos, and searches Intelligent Search v1 with `hideUnavailableItems=true`, `sort=discount:desc`, `count` and `page=1`. The measure of a product comes from its "Gramaje de unidad de medida/consumo" properties, or from `unitMultiplier` for products sold by kg. Simulation money is converted from cents; savings are the negative `priceTags`, and the promotions named are the `rateAndBenefitsIdentifiers` whose id appears in a price tag. Fixtures in `src/product-selection/fixtures/` are trimmed live responses recorded on 2026-10-13.

Two changes from the spec, found in real runs:
- Terms narrow the Candidates (ADR 0003): with terms, the search asks for 50 results and code keeps only names that contain every term before taking two.
- The Candidates are the first two results that are **available in simulation**, simulating in order up to the first 10 results. With only the first two, an unavailable result ("Mate Listo Autocebante", hidden as available by search but not deliverable) left a single Candidate, and a 500 g collector tin of yerba at $35,582/kg won with no competition.

Real runs on 2026-10-13, postal code 1425:
- "dos cocas de 2,25 y yerba, envío a 1425": Coca-Cola 2,25 x2 at $4,500 each ("2do al 50%"), Yerba Carrefour Classic 1 kg at $3,604.50 (11% "Mi CRF"); total $12,604.50. Carrefour 1.8 s, 3 Claude Code sessions.
- "un Cindor, leche entera y fideos tirabuzón", postal code answered "1425": Cindor 1 lt $8,210; Leche clásica UAT Bulnez 1 lt $1,890; Fideos penne rigati Majora 500 g $2,390; total $12,490. Carrefour 2.7 s.
- Eval subset `cindor ticket-01 adr-0004`: 3/3 hits after the split change.

Found in those runs, for the Owner to decide (vocabulary, not code): the Tipo "Mate listo" is mapped to `yerba` and holds thermoses; the Product Type `fideos-tirabuzon` is named "Fideos guiseros" and its Tipo holds penne, so "fideos tirabuzón" got penne. The reason text follows the product's measure property, which can say "por kilo" for a 1 lt drink when Carrefour records it in grams.
