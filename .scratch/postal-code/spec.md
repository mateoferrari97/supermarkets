Status: resolved

# Know the Owner's postal code before any order

## Problem Statement

Prices, stock and promotions at Carrefour depend on the Owner's location: the same Limón is `available` at postal code 1425, `withoutPriceFulfillment` at 1001 and `cannotBeDelivered` at 2000 (`.scratch/carrefour-cart/research/live-search-and-simulation.md`, live checks on 2026-10-14). Today the postal code is read out of the order text, or asked at the end of the order's questions, and it is never checked against Carrefour. That fails the Owner in three ways:

- When Carrefour's regions endpoint returns no region, product search silently runs without `regionId`, so Candidates come from no particular location: products show as unavailable that are available for the Owner, and the other way round.
- When the postal code maps to a region with no stores (the regions endpoint answers `SW#` with zero sellers, as it does for "C1425ABC"), every search comes back empty and the Owner gets no product with no explanation.
- A postal code Carrefour rejects (`ORD006`, HTTP 400) is only found out after every question of the order has been answered.

The Owner thinks of the postal code as something known before ordering, not as part of each order.

## Solution

The postal code is set before any order is written. The order command asks for it first ("¿A qué código postal es el envío?"), or takes it as an argument, and checks it with Carrefour before reading the order: the postal code is accepted only when Carrefour returns a region with at least one store. Otherwise the Owner is told that Carrefour does not deliver there (or that the code is not valid) and is asked again. Only then is the order text read.

Once accepted, the postal code is the Owner's location for everything that follows: Intelligent Search always runs with the `regionId` of that postal code, and every checkout simulation carries it. Search never runs without a region. The order text no longer carries the postal code and the order's questions never ask for it. The cart shown to the Owner states the postal code it was built for.

## User Stories

1. As the Owner, I want to give my postal code before I write my order, so that everything I see is for where I live.
2. As the Owner, I want to be asked for my postal code first when I start an order without it, so that I never get products for the wrong location.
3. As the Owner, I want to pass my postal code as an argument of the order command, so that I do not have to type it every time I am asked.
4. As the Owner, I want my postal code checked with Carrefour before my order is read, so that I do not answer questions about an order Carrefour cannot deliver.
5. As the Owner, I want to be told "Carrefour no entrega en el código postal 2000" when no Carrefour store serves my postal code, so that I know why there would be no products.
6. As the Owner, I want to be told when Carrefour does not accept what I wrote as a postal code, so that I can correct a typo.
7. As the Owner, I want to be asked again after a postal code is rejected, so that I can fix it without starting over.
8. As the Owner, I want to write my postal code as "1425", "CP 1425" or "C1425ABC", so that I can use whichever form I know.
9. As the Owner, I want the four digits of a "C1425ABC" postal code used, so that Carrefour's empty region for the full form never hides my products.
10. As the Owner, I want to stop when I give no postal code, so that nothing is searched without a location.
11. As the Owner, I want product search to always use my location, so that only products available where I live are Candidates.
12. As the Owner, I want promotions and prices simulated for my postal code, so that the savings I see are the ones I get.
13. As the Owner, I want my order text to be only about what I buy, so that I do not have to remember to add "envío a 1425".
14. As the Owner, I want the order's questions to be only about my Items, so that I am never asked for something I already gave.
15. As the Owner, I want "envío a 1425" left in my order text to be ignored rather than read as an Item, so that old habits do not break the order.
16. As the Owner, I want the cart to say which postal code it was built for, so that I can check it matches the address in my Carrefour account.
17. As the Owner, I want an error from Carrefour while checking my postal code reported as such, so that a Carrefour outage is not mistaken for "no delivery".
18. As the developer, I want the Online Store to answer whether it delivers to a postal code, so that the order command does not depend on Carrefour's region format.
19. As the developer, I want product picking to refuse to run without an accepted postal code, so that a search without a region can never happen again.
20. As the developer, I want the Carrefour adapter tested with recorded regions responses (region with stores, empty region, rejected postal code), so that each case keeps working when the code changes.
21. As the developer, I want Order Resolution to stay offline, so that ADR 0003 holds and its tests need no Online Store.

## Implementation Decisions

- The postal code becomes an input of the order, given before the order text, not something extracted from it. The order command asks for it before reading the order, or takes it as an argument, and loops until it is accepted or the Owner gives none (then it stops).
- The four digits are taken from what the Owner wrote with the existing postal code parsing, before Carrefour is asked. Text with no four digits is asked again without calling Carrefour.
- The Online Store interface gains one operation that answers whether the store delivers to a postal code, with three outcomes: delivers, does not deliver, and postal code rejected. Errors other than a rejected postal code propagate.
- The Carrefour adapter answers it from the regions endpoint: delivers when it returns a region with at least one seller; does not deliver when it returns no region or a region with no sellers (`SW#`); rejected on HTTP 400 `ORD006`. The region is cached by postal code, as today, so search reuses it.
- Candidate search in the Carrefour adapter never runs without a `regionId`: if a region cannot be found it is an error, not a search without region.
- Order Resolution no longer handles the postal code: `split-order` stops returning it, the postal code question disappears from the order's questions and from `map-answer`, and the resolution no longer carries it. A postal code written in the order text is neither an Item nor read.
- Product picking takes the accepted postal code as its own input next to the resolved order, and every search and simulation uses it. The Product Selection reports the postal code it was built for, and the command prints it with the cart, as today.
- The Glossary entry for the Online Store location changes from "follows from the postal code the Owner writes in each order" to "follows from the postal code the Owner gives before the order". The product selection spec's stories about writing and being asked for the postal code are superseded by this spec.
- Persisting the postal code between runs is not part of this spec; it is given on every run.

## Testing Decisions

- Good tests here check what the Owner gets and what Carrefour is asked, through the public functions, not how the region is stored or cached.
- Carrefour adapter: the delivery check with recorded regions responses for a region with stores (the existing 1425 fixture), an empty region (`SW#`, recorded for "C1425ABC") and a rejected postal code (400 `ORD006`, recorded for "abc"); and that candidate search fails instead of searching when no region is found. Prior art: the adapter tests that route URLs to fixtures through a fake HTTP client.
- Product picking: refuses to run without an accepted postal code, and passes it to every search and simulation. Prior art: the existing picking tests with a fake Online Store.
- Order Resolution: the postal code tests change to "no postal code question, even when the order has none", and the split result has no postal code. Prior art: the existing question tests with a fake LLM.
- The order command's prompting loop stays a thin script and is checked with a manual run: no postal code, a non-served one (2000 by the live check above, or whatever is non-served on the day), a rejected one, then 1425.
- `pnpm check` exits 0.

## Out of Scope

- Remembering the Owner's postal code between runs or tying it to a profile.
- Detecting a postal code that does not exist but that Carrefour still maps to stores (9999 returns a region with 8 stores).
- Pickup at a store (retiro en sucursal) and its own stock.
- Making the cart link carry the postal code, or checking it against the address saved in the Owner's Carrefour account.
- Promo-first candidate search and the other product picking issues found on 2026-10-14 (canned cherry tomatoes, answers to questions ignored).

## Further Notes

- Verified live on 2026-10-14: `GET /api/checkout/pub/regions?country=ARG&postalCode=1425` returns one region whose id is base64 of `SW#carrefourar0026;…` with 10 sellers; "C1425ABC" returns `SW#` with no sellers; "9999" returns 8 sellers; "abc" returns HTTP 400 `ORD006`. Intelligent Search ignores `zip-code` and `country` (no Limón available) and honours `regionId` (8216 and 6485 available).
- The cart link built from the picked products does not carry the postal code: the Carrefour cart uses the address of the Owner's account, so stock can differ from what was simulated. Stating the postal code with the cart is the mitigation here; fixing the link is a later feature.
