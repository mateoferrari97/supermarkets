---
Status: accepted
---

# No Payment Card or preference for now; one fixed Selection Policy picks the products

Order matching is being rebuilt so that each Item reaches the right product, and the Payment Card and the preference add rules to every step of it without helping that goal. Until matching is refined, the Assistant ignores both. The LLM no longer reads a card or a preference out of the order: `split-order` only flags with `ignoredPreference` that the Owner wrote one ("pago con Visa", "solo La Serenísima"), and the cart then says "Por ahora no tengo en cuenta tarjetas ni preferencias". Neither ever becomes an Item. Checkout is simulated without payment data, so card promotions do not count.

Code still picks the products, as ADR 0002 decided, but with one fixed Selection Policy instead of one translated from the Owner's words: savings first (a promotion or a direct discount at the quantity bought), then the lowest price per unit of measure, then the lowest `itemId`. Only a brand the Owner named on an Item narrows the search. The `translate-preference` task, the brand rules (`brandsOnly`, `brandsPreferred`, `brandsExcluded`), the `cheapest-per-unit` ranking, the Payment Card table in `vocabulary/` and `pnpm payment-cards` are removed.

A cheaper product with a card promotion the Owner could get is missed, and an Owner who wants only one brand must name it on each Item. Both come back as their own effort once matching is settled.

ADR 0014 amends this decision: the postal code is kept in the Profile. Payment cards and preferences are still ignored, and code still picks the products.

## Considered Options

- **Keep both and fold them into the new matching flow.** Every matching decision (search, Fits, size rule, Alternatives) would also have to handle brand rules and card prices before matching works at all.
- **Ignore them silently.** Simpler, but the Owner would believe a card or a brand rule was applied.
