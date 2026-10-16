# 06: Payment Card and preference

Type: grilling
Status: resolved
Blocked by: 02

## Question

Where do the Payment Card and the preference come from in the new flow (more fields of call 1, or a separate call), and how does the Selection Policy (`brandsOnly`, `brandsPreferred`, `brandsExcluded`, ranking) apply on top of the Fits and the size rule?

## Comments

- From [Size and quantity in code](04-size-and-quantity-in-code.md): the size rule narrows the Fits before the Selection Policy, and a weight quantity yields options that mix Fits sold by weight (price per kg times the amount) with packaged Fits (price times n). The Selection Policy must compare them by total price of the option, not by `Price`.
- From [Questions and answers in the new flow](05-questions-and-answers.md): an Alternative the Owner picks by number is bought as is, without the size rule; whether the Selection Policy still applies to it (for example `brandsExcluded`) is open here.

## Answer

Agreed with the Owner on 2026-10-15: **the Payment Card and the preference are removed for now**, so order matching is refined first without them. They come back later as their own effort.

- **Removed now, in code, outside the map's build spec**: `paymentCard` and `preference` of `split-order`, the `translate-preference` task and prompt, the brand rules and `unexpressed` of the Selection Policy, `payment-cards.ts`, `vocabulary/carrefour-payment-cards.json`, `pnpm payment-cards` (and its step in `pnpm check`), the card of the checkout simulation (always simulated without one), the Payment Card glossary term. ADR 0002 is superseded by ADR 0011 (`docs/adr/0011-no-payment-card-or-preference-for-now.md`), which records the removal. Done on 2026-10-15 at the Owner's request, as the one production change of this map; `pnpm check` passes.
- **Selection Policy is one fixed rule**: savings first (a promotion or a direct discount at the simulated quantity), then the lowest price per unit of measure, then the lowest `itemId`. The glossary term stays, without the Owner's preference.
- **Candidates**: every option left after the size rule, at most 10 per Item, the cheapest per unit of measure by Catalog Snapshot price; each is simulated alone at the quantity bought.
- **Comparing options**: price per unit of measure, total ÷ (quantity × size), or total ÷ kg for a product sold by weight. When every option gives the same amount this is the total price, as [Size and quantity in code](04-size-and-quantity-in-code.md) asks.
- **An Owner who still writes a card or a preference** ("pago con Visa", "solo La Serenísima"): call 1 never turns it into an Item and sets a boolean `ignoredPreference`; the cart then says "Por ahora no tengo en cuenta tarjetas ni preferencias".
