# 04: Buy the right quantity, including products sold by weight

**What to build:** An Item with no quantity is bought once, a fraction is rounded up and told, a product sold by weight is bought in its steps ("medio kilo de banana" is one 0.5 kg step), and when a promotion needs more units than were asked the line says how much cheaper it would be, without adding units. See `.scratch/product-selection/spec.md` (Quantities, Promotion hint).

**Blocked by:** 01

**Status:** resolved

- [x] No quantity is 1; a fractional quantity of a product sold by unit is rounded up to whole units with a notice.
- [x] For a product sold by weight, the amount comes from the Item (a weight term such as "500 g", or the quantity in kg) and is sent as kg / `unitMultiplier` rounded up, with a notice when rounded; with no amount, one step is bought.
- [x] When a Candidate's teaser has a `minimumQuantity` above the quantity bought, the line says the unit price at that quantity; no units are added.
- [x] Tested through `pickProducts` with fake ports, including a recorded weighed product.
- [x] `pnpm check` exits 0.

## Comments

`StoreProduct` carries `weightStepKg` (the `unitMultiplier` of products whose `measurementUnit` is `kg`) and its seller 1 `teasers` with `minimumQuantity`. The quantity is computed per Candidate, because only the product says whether it is sold by weight. For a weighed product, a weight term ("500 g") is the amount and is not matched against the name. `split-order` now reads a weight of something sold loose ("medio kilo de banana") as the quantity in kg, because a "500 g" term would fail the term check of order resolution against "Banana elegida x kg.".

The promotion hint simulates the picked product alone once more at the teaser's `minimumQuantity` and is shown only when the unit price would be lower. Live on 2026-10-14: Pepsi 500 cc at $1,900, "Llevando 2 sale $1235.00 c/u en vez de $1900.00 (PROMO-2do al 70% …)". Banana selección x kg (step 0.5) at quantity 2 cost $1,999 (`fixtures/simulation-banana.json`).
