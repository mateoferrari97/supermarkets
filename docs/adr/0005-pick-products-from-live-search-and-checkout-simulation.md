---
Status: accepted
---

# Pick products from live search and checkout simulation, not from the Catalog Snapshot

ADR 0002 has code pick the products from the Catalog Snapshot so the same Items always give the same cart. The snapshot cannot do that well: its stock is a flag that disagrees with checkout, its prices and stock are not the Owner's region, and card promotions ("Tarjeta Carrefour 20% Off Martes", "2do al 70% Tarjeta Carrefour") appear only when checkout is simulated with a card ([Carrefour API](../references/carrefour-api.md#checkout-simulation)). So products are picked live. For each resolved Item, Intelligent Search v1 lists the products of the Carrefour Tipos mapped to its Product Types in the Owner's region (`regionId` from the postal code written in the order), available only, filtered by brand when one applies, sorted by discount or by price as the Selection Policy says; the first two are simulated one by one at the quantity bought, with the postal code and the Owner's card, and code picks between them with the fixed rules of ADR 0002 on the simulated prices (savings first, then lowest price per unit of measure, then lowest `itemId`). The whole cart is simulated again before it is shown.

Understanding the order stays on the Catalog Snapshot (ADR 0003): the BM25 evidence, term checks and size options do not need live data and stay offline and repeatable. The LLM still only translates; code still picks.

The cart is now repeatable only for the same search and simulation answers: the same order at another time, day of the week, region or card can get other products. Ties are broken by `itemId`, so the same answers always give the same cart.

## Considered Options

- **Pick from the Catalog Snapshot and confirm with one simulation (ADR 0002 as written).** Repeatable, but blind to the region, to real stock and to card promotions.
- **Estimate prices from search teasers and simulate only the chosen products.** Fewer calls, but card promotions that search does not show are missed, and promotions replace each other in ways the teasers do not describe.
- **Simulate every candidate of a Product Type.** The most accurate, but tens of calls per Item.
- **Rank candidates in code by price per unit before simulating.** Catches a bigger pack that is cheaper per litre, but needs every product of the Tipo per Item; the Owner chose Carrefour's own sort and two candidates, accepting that a cheaper pack lower in the list can be missed.
