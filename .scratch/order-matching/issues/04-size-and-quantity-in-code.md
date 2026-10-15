# 04: Size and quantity in code

Type: grilling
Status: resolved
Blocked by: 02

## Question

How does code turn `size` and `quantity` into one product and a quantity among the Fits: what "the most common size" means exactly, how sizes are read from product names, how `biggest` and `smallest` treat products sold by weight, and where the sale step (`unitMultiplier`) comes from, given that the Catalog Snapshot lacks it: add it to `pnpm carrefour:catalog`, or read it from live search or the simulation? Research the Carrefour API for the second part.

## Comments

- From [Prototype the two calls](02-prototype-the-two-calls.md): sizes read from names fail ("Aceite de girasol Cocinero 15 l" is 1.5 l; `consumptionQuantity` 1500 and `measureUnit` CM3 in the snapshot are right; "4 x 30 m" is not read). Units asked of a product sold by kg ("3 manzanas"), a weight asked of packaged products ("jamon cocido 300g" picked a 200 g pack), and "cheapest" comparing per-kg with per-unit prices all need a rule. Call 2 sometimes keeps flavoured variants, so the size rule must not be what decides among them.

## Answer

Agreed with the Owner on 2026-10-15. New glossary term: **Sale Step** (`unitMultiplier` in the Carrefour API).

Facts checked on 2026-10-15:

- `pnpm carrefour:catalog` downloads from `catalog_system/pub/products/search` (`src/adapters/carrefour/catalog-download.ts`), whose items already carry `measurementUnit` and `unitMultiplier`; the download schema drops them. Live: "Banana selección x kg." `kg 0.5`, "Tapa de cuadril (picanha) Etiqueta Negra x kg" `kg 1.25`, "Jamón cocido Cagnoli x kg." `kg 0.1`, packaged products `un 1`.
- The snapshot's `measureUnit` does not tell a product sold by weight: the banana is `GRM 1000`. Only `measurementUnit === "kg"` does. `Price` of a product sold by weight is per kg (banana 1999, picanha 24900).
- In-stock products by `measureUnit`: GRM 5868, UNI 5090, CM3 3342, GRS 574, null 91, the rest under 70 each.

Decisions:

1. **Sale Step source**: `pnpm carrefour:catalog` adds `measurementUnit` and `unitMultiplier` to each product of the Catalog Snapshot. Same endpoint, no extra requests. A product is sold by weight when `measurementUnit` is `kg`; its Sale Step is `unitMultiplier`. The checkout simulation keeps the last word (`CHK0023` on an invalid quantity).
2. **Size of a product**: only from `measureUnit` and `consumptionQuantity`, normalized to ml, g, units or metres. Names are never read. A product without them (91 in stock) has no size. A product sold by weight has no size: what is bought is its quantity. A product without size enters the size rule only when the Item's size is `common`.
3. **Most common size**: the mode of (dimension, amount) among the packaged Fits of the Item. A tie goes to the size whose cheapest product is cheapest per unit of measure. When every Fit is sold by weight, no size rule applies.
4. **`biggest` and `smallest`**: only packaged Fits of the majority dimension count; Fits sold by weight are left out. When no Fit is packaged, the size is ignored and a note says so.
5. **Exact size missing**: the nearest size in the same dimension, the bigger one on a tie, with a note ("No hay de 2,25 l; llevo 2 l"). No question: questions are only for an Item with no Fit.
6. **Quantity in weight** ("jamón cocido 300 g", "picaña 2 kg"): code builds every option that gives that weight: each Fit sold by weight at the weight rounded to its Sale Step, and each packaged Fit at n = ⌈weight ÷ size⌉ when the total exceeds the weight by less than one package. The Selection Policy chooses by total price, so 300 g packaged and 0.3 kg sold by weight compete as equals. A weight quantity replaces the size rule unless the Item's size is `exact`.
7. **Units of a product sold by weight** ("3 manzanas"): packaged Fits sold by the unit come first; when there are none, one Sale Step per unit, with a note ("Carrefour vende por kg: llevo 1,5 kg"). No average-weight table, no question.
8. **Rounding to the Sale Step**: to the nearest multiple, at least one Sale Step, with a note when the amount changes ("La picaña se vende de a 1,25 kg: llevo 2,5 kg").
9. **Default quantity** (`minimum`): one unit of a packaged product, one Sale Step of a product sold by weight (as in [design.md](../design.md)).

Left to other tickets: how the size rule and the Selection Policy compose and how prices per kg and per unit are compared go to [Payment Card and preference](06-payment-card-and-preference.md); how these notes join the notes of call 2 stays in the map's fog.
