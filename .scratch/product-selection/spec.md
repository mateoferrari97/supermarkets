Status: resolved

# Pick one product per Item from live Carrefour search and checkout simulation

## Problem Statement

The Owner can now write an order and get every Item resolved to Product Types with quantity, brand and terms, but nothing turns that into products. The Owner wants the cheapest sensible product for each Item in their own region, with the promotions they can actually get (including the ones of the card they pay with), and wants to see why each product was chosen. The Catalog Snapshot cannot answer this: its stock disagrees with checkout, its prices are not the Owner's region, and card promotions only appear when checkout is simulated with a card (ADR 0005).

## Solution

After the order is resolved, a new step picks one product per Item. The order text may also carry a postal code ("envío a 1425"), a Payment Card ("pago con Tarjeta Carrefour Mastercard") and a preference for the whole order ("priorizá promos", "lo más barato por litro", "solo La Serenísima", "nada de Sancor"). A missing postal code is asked in the order's questions message. The preference is translated by the LLM into a Selection Policy of fixed rules; anything no rule can express is reported back and the rest goes ahead.

For each Item, Intelligent Search v1 lists the products of the Carrefour Tipos mapped to its Product Types, in the Owner's region, available only, filtered by brand, sorted by discount or by price as the Selection Policy says. The first two are the Candidates. Each Candidate is simulated on its own at the quantity bought, with the postal code and the Payment Card, and code picks one with the fixed rules on the simulated prices. The whole cart is simulated once more; an unavailable product is swapped for the other Candidate. The Owner sees each Item with the product, quantity, unit price, subtotal and the reason it was picked, and the order total. Building the cart link is the next feature.

## User Stories

1. As the Owner, I want one product picked for every resolved Item, so that my order becomes something I can buy.
2. As the Owner, I want to write my postal code in the order, so that prices, stock and promotions are the ones of my region.
3. As the Owner, I want to be asked for my postal code when I forget it, so that products are never picked for the wrong region.
4. As the Owner, I want to name the card I pay with, so that its promotions count when products are picked.
5. As the Owner, I want to name my card instead of typing its number, so that ordering stays natural and I share nothing sensitive.
6. As the Owner, I want promotions first by default, so that I save money without saying so.
7. As the Owner, I want to be able to ask for the cheapest per litre or kilo instead, so that I can ignore promotions when I want.
8. As the Owner, I want to say "solo X", "prefiero X o Y" or "nada de X" for the whole order, so that brands I care about are respected.
9. As the Owner, I want a brand I named on an Item to win over the order's preference, so that "un Cindor" is always Cindor.
10. As the Owner, I want a preference that cannot be expressed reported back to me, so that I know it was not applied.
11. As the Owner, I want only products that are available in my region considered, so that nothing unbuyable is picked.
12. As the Owner, I want products picked by the price checkout actually charges, so that promotions that only show in the cart count.
13. As the Owner, I want savings first, then the lowest price per litre or kilo, then a fixed tie-break, so that the same answers always give the same products.
14. As the Owner, I want an Item resolved to several Product Types ("cualquiera") picked among all of them, so that the cheapest one wins.
15. As the Owner, I want an Item with no quantity bought once, so that I do not have to write "uno".
16. As the Owner, I want a fractional quantity rounded up and told, so that I never get less than I asked for.
17. As the Owner, I want products sold by weight bought in their steps (such as 0.5 kg) and rounded up, so that "medio kilo de banana" works.
18. As the Owner, I want no extra units added for a promotion, and to be told when buying more would be cheaper per unit, so that I decide.
19. As the Owner, I want an unavailable product swapped for the other Candidate and told, so that the cart still has the Item.
20. As the Owner, I want to be told when an Item could not be filled at all, so that I can buy it some other way.
21. As the Owner, I want the final price from checkout shown even if it changed, so that I see what I will pay.
22. As the Owner, I want each line to say why the product was chosen ("20% Off Martes con Tarjeta Carrefour", "el más barato por litro"), so that I can tell whether the rules picked well.
23. As the Owner, I want the order total, so that I know what the cart costs.
24. As a developer, I want product picking behind one entry point with search, simulation and LLM as injected ports, so that it is tested end to end with fakes.
25. As a developer, I want the Carrefour adapters tested with recorded responses, so that `pnpm check` never calls Carrefour.
26. As a developer, I want a single command that runs order resolution and product picking on real Carrefour and Claude Code sessions, so that I can try a real order.

## Implementation Decisions

- **Order-level details.** The `split-order` task also returns the order's postal code, Payment Card name and preference text (each nullable). A missing postal code becomes a question in the order's questions message, answered through `answerQuestions` like the others.
- **Selection Policy (ADR 0002).** A new LLM task translates the preference text into a fixed shape validated by zod: a ranking (`savings-first`, the default, or `cheapest-per-unit`), brands only, brands preferred and brands excluded, plus the parts it could not express. A brand on an Item is strict and overrides the order's brand rules for that Item.
- **Entry point.** `pickProducts(resolution, dependencies)` takes a settled Order Resolution and returns a Product Selection: per Item the product (`itemId`, name, brand), quantity bought, unit and total price from checkout, the reason, and notices (rounded quantity, swapped Candidate, cheaper with more units, not filled); plus the order total and the unexpressed preferences. Dependencies: the vocabulary, the Carrefour mapping, the Payment Card table, the search port, the simulation port, the LLM port.
- **Search port (Intelligent Search v1).** Resolves a postal code to a `regionId` (`/api/checkout/pub/regions`), and lists products with `/api/intelligent-search/v1/product-search/trade-policy/1/{facets}?sc=1&regionId=..&hideUnavailableItems=true&sort=..&count=..&page=1` (`page` must be sent for `count` to apply). Facets are the `tipo-de-producto` slugs of the Carrefour Tipos mapped to the Item's Product Types and, when a brand rule applies, `brand` slugs. Slugs are read from the facets endpoint, not built by hand. Sort is `discount:desc` for `savings-first` and `price:asc` for `cheapest-per-unit`. Excluded brands are filtered out in code.
- **Candidates.** The first two products returned are the Candidates (ADR 0005). If search returns none, products of the Catalog Snapshot of the same Tipos are tried through simulation instead.
- **Simulation port.** `POST /api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0` with `country: "ARG"`, the postal code, seller `"1"`, and, when the Owner named a Payment Card, `paymentData` with that card's payment system and BIN. Each Candidate is simulated alone, because quantity promotions fire across different SKUs in one cart. Prices come from `priceDefinition`; savings from `priceTags`; the reason from `ratesAndBenefitsData.rateAndBenefitsIdentifiers`.
- **Picking rules.** Among available Candidates: with `savings-first`, a Candidate with a saving beats one without; then the lowest price per unit of measure (from the product's measurement properties, falling back to price per package); then the lowest `itemId`. With `cheapest-per-unit` the saving is ignored.
- **Quantities.** No quantity is 1. A fraction is rounded up to whole units, or, for a product sold by weight, to steps of its `unitMultiplier` (quantity sent = kg / `unitMultiplier`, rounded up); a weight in the Item's terms ("500 g") is the amount to buy. Both are reported as notices.
- **Promotion hint.** If a Candidate's teaser has a `minimumQuantity` above the quantity bought, the picked product's line says how much cheaper per unit it would be at that quantity. No units are ever added.
- **Final check.** The chosen products are simulated together. An unavailable one is replaced by the other Candidate of its Item and the cart is simulated again; with none left the Item is reported as not filled. A changed price is kept and shown.
- **Payment Card table.** A committed JSON file mapping card names the Owner may write to a payment system id and a BIN; validated in `pnpm check`. It starts with the Tarjeta Carrefour cards whose promotions were verified in simulation.
- **Command.** `pnpm order "<text>"` continues after the questions round with product picking on real Carrefour and prints the Product Selection.

## Testing Decisions

- A good test drives `pickProducts` with a hand-made resolution, vocabulary, mapping, card table and fake search, simulation and LLM ports, and checks the returned Product Selection; it does not check request shapes or internal calls.
- Tested through the entry point: default ranking picks the Candidate with savings; `cheapest-per-unit` compares price per unit; tie-break by `itemId`; brand only, preferred and excluded; Item brand wins over the order's; unexpressed preference reported; several Product Types; no quantity; fractional quantity; weighed product steps; promotion hint without extra units; Payment Card passed to simulation and reflected in the reason; unavailable Candidate swapped; nothing available reported; changed price shown; missing postal code asked.
- The search and simulation adapters are tested with recorded Carrefour responses (saved from live calls) through an injected HTTP client: regions, facets, product search with pagination, simulation with and without a card, an unavailable item, an error.
- The Payment Card table is validated in `pnpm check`.
- Prior art: `src/order-resolution/resolve-order.test.ts` (entry point with fakes) and `src/order-resolution/claude-code-llm.test.ts` (adapter with recorded outputs).

## Out of Scope

- Building the Carrefour cart link (next feature).
- Bank card promotions other than Tarjeta Carrefour, until one is found and verified.
- Ranking all products of a Tipo by price per unit before simulating (ADR 0005 considered options).
- Adding units for a promotion.
- Remembering the postal code, card or preference between orders (ADR 0004).
- A warning when the Catalog Snapshot is old.
- Online Stores other than Carrefour.

## Further Notes

- Facts behind these decisions, with the requests made: `.scratch/carrefour-cart/research/live-search-and-simulation.md`.
- Unknowns to watch: the simulation's item cap and the rate limits of search and simulation (none documented); whether weekday promotions ("20% Off Martes") are offered on other days; whether bank card promotions exist.
- Expected cost of one order: one regions call, one or two searches per Item, two simulations per Item and one or two final simulations; a simulation took 0.3 to 0.5 s from this machine.
