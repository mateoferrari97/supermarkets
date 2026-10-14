# What can the public Intelligent Search v1 and checkout simulation of carrefour.com.ar tell a program that picks one product per Item?

Consulted 2026-10-13 (a Tuesday). Marks: **[V]** verified in the cited doc or in a live response, **[I]** inference, **[?]** not verified.

Primary sources:
- VTEX OpenAPI specs behind developers.vtex.com (github.com/vtex/openapi-schemas): Search API, Intelligent Search API (Legacy), Intelligent Search API v1, Checkout API, Catalog API, Promotions & Taxes API.
- API reference pages: https://developers.vtex.com/docs/api-reference/intelligent-search-api-v1, https://developers.vtex.com/docs/api-reference/checkout-api, https://developers.vtex.com/docs/api-reference/search-api
- Release note on teasers: https://developers.vtex.com/docs/release-notes/2023-07-06-search-api-teasers-field-deprecation
- Checkout error codes: https://developers.vtex.com/docs/guides/checkout-error-codes
- Live anonymous requests against https://www.carrefour.com.ar (about 65 in total, no cookies).
- Sibling notes: `carrefour-ar-cart.md`, `catalog-mirror.md`.

## Answer

Intelligent Search v1 (`GET /api/intelligent-search/v1/product-search/trade-policy/1/{facets}?sc=1`) is the public, documented way to list candidates: it filters by Carrefour Tipo and brand, by region, by availability, and sorts by price or discount, and its teasers carry structured quantity promotions. Only the checkout simulation (`POST /api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0`) gives the price actually charged: it applies every promotion, including card promotions that search does not show, and it reports availability per item. Region comes from the postal code: search needs a `regionId` from the regions endpoint, the simulation takes the postal code. No public endpoint returns promotion rules (dates, unit caps); the Promotions & Taxes API is private.

## Intelligent Search v1

- [V] Public: "This endpoint does not require authentication or permissions." Responses are cached (`cache-control: public, max-age=600` live).
- [V] Facets: `GET /api/intelligent-search/v1/facets/trade-policy/1?query=gaseosa&sc=1` exposes keys `category-1..3`, `tipo-de-producto`, `brand`, `price`, `envase-tipo`, `productclusternames` and others; values come as slugs with counts (`{"value":"gaseosa","name":"Gaseosa","quantity":415}`).
- [V] Filtering by Tipo needs no query: `/product-search/trade-policy/1/tipo-de-producto/gaseosa?sc=1` returned only products whose `Tipo de producto` is Gaseosa (415 of 415 checked). Adding `/brand/coca-cola` returned 14, all Coca Cola.
- [V] Pagination: `count` is ignored unless `page` is also sent (`count=50` alone returned 24). `count` maximum is 100 (`count=101&page=1` returns `INVALID_PARAMETERS`). A whole Tipo of 415 pages through in 5 pages without duplicates.
- [V] `sort=price:asc` orders by package price; `sort=discount:desc` orders by `ListPrice` against `Price` only, without card promotions.
- [V] `hideUnavailableItems=true` keeps products with `AvailableQuantity` 10000 and drops those with 0 (89 of 415 Gaseosas kept). `AvailableQuantity` is a flag, not a stock count: "The value is 10000 when the item is considered available, and 0 when the item is not available."
- [V] `zip-code` and `country` changed nothing (same 89 products and prices for 1425 and 5000). `regionId` from `GET /api/checkout/pub/regions?country=ARG&postalCode=5000` changed the result to 129 products with other prices (Sprite 17427: 5530 instead of 6000), and it matched a simulation at postal code 5000.
- [V] Offer fields: `Price`, `ListPrice`, `PriceWithoutDiscount`, `spotPrice`, `AvailableQuantity`, `teasers`, `discountHighlights`, `PriceValidUntil`. `priceRange.sellingPrice` is not the effective price (it differs from `Price` in 351 of 415 products).
- [V] Teasers are structured: `{"name":"PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10","conditions":{"minimumQuantity":2,"parameters":[{"name":"SkuIdsList","value":"3807,11187,15509"}]},"effects":{"parameters":[{"name":"PercentualDiscount","value":"25"}]}}`. The unit cap and dates appear only in the name. The legacy catalog search returns the same teaser with empty `Effects`.
- [V] Product properties include `Tipo de producto`, `EC_Sección`, `EC_Familia`, `Cantidad Maxima Permitida`, `pricePerUnit`, `Gramaje de unidad de consumo`, `Fraccionable`, and text properties of card promotions such as `"Tarjeta Mi Carrefour Crédito": ["2do al 70% Carrefour credito"]`.

## Checkout simulation

- [V] Public: "This endpoint does not require authentication or permissions." Body `{"items":[{"id":"3807","quantity":2,"seller":"1"}],"country":"ARG","postalCode":"1425"}`. Money in cents.
- [V] `RnbBehavior`: "Use `0` for simulations at cart stage, which means all promotions apply … if this not sent, the parameter is `1`."
- [V] A quantity promotion applies to every unit once the minimum is reached: Coca-Cola 2,25 (sku 3807, 6000) costs 6000 at 1, 4500 each at 2, 4500 each at 3.
- [V] Products sold by weight are bought in steps of `unitMultiplier`: banana (0.5) at quantity 2 is 1 kg; `quantity` 1.5 returns `CHK0023` "Cantidad de item inválida".
- [V] `availability` per item: `available`, `withoutStock`, `cannotBeDelivered` ("Only SKUs with the `available` value can be sold and delivered"); live also `withoutPriceFulfillment`. Search and simulation disagree without a region: sku 3802 was hidden by search but `available` in simulation.
- [V] Card promotions need payment data: adding `"paymentData":{"payments":[{"paymentSystem":"502","bin":"507858","installments":1,"value":600000,"referenceValue":600000}]}` (502 is "Tarjeta Carrefour Mastercard", listed in the response's `paymentData.paymentSystems`) took sku 3807 from 6000 to 4800 ("Tarjeta Carrefour 20% Off Martes"); at quantity 2 it became 3900 each with "2do al 70% Tarjeta Carrefour o Cuenta digital … COCA COLA", a promotion not among the product's search teasers. Promotions replaced each other instead of stacking. A Visa BIN (450995) got no discount.
- [V] A quantity promotion fires across different SKUs in one simulation: sku 3807 and 11187 at quantity 1 each triggered "2do al 50%" on 3807. Candidates of one Item must be simulated apart.
- [V] Timing from this machine: 0.30 to 0.53 s per simulation of one item, 0.71 s for ten items.
- [?] No documented item cap or rate limit (error codes CHK0062 "Max allowed items exceeded" and FMT0104 exist without a number).
- [?] Whether "20% Off Martes" is offered or applied on other days; whether bank (non-Carrefour) card promotions exist in other Tipos (only the two Tarjeta Carrefour promotions appeared among 415 Gaseosas).

## Promotions API

- [V] Promotions & Taxes API routes are `/api/rnb/pvt/...` and require the License Manager resource "GerenciarPromocoesETarifas". No public endpoint returns promotion rules.
