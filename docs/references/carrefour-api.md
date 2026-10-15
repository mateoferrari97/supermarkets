# Carrefour API

Facts about the public endpoints of https://www.carrefour.com.ar that the code depends on. carrefour.com.ar runs on VTEX; every endpoint below answers anonymous requests without cookies. The facts were checked with live requests on 2026-10-13 and against the VTEX API reference (https://developers.vtex.com/docs/api-reference/intelligent-search-api-v1, https://developers.vtex.com/docs/api-reference/checkout-api). The adapter is `src/adapters/carrefour/carrefour-store.ts`; the full catalog download is `src/adapters/carrefour/catalog-download.ts`, run by `pnpm carrefour:catalog`.

## Regions

`GET /api/checkout/pub/regions?country=ARG&postalCode=<code>` turns a postal code into a region.

- It answers a list with one region: a base64 `id` and the branch `sellers` that serve it (for example `carrefourar0026` "Hiper Warnes" for 1425, `carrefourar0009` "Hiper Córdoba Colón" for 5000).
- A region with no sellers, or an empty list, means Carrefour does not deliver there.
- A postal code Carrefour does not accept answers HTTP 400 with `error.code` `ORD006` ("El campo código postal (abc) del anexo de envío es no válido").
- Search needs the region `id` as `regionId`; the simulation takes the postal code itself.

## Intelligent Search v1

`GET /api/intelligent-search/v1/product-search/trade-policy/1/<facets>?sc=1` lists products; `GET /api/intelligent-search/v1/facets/trade-policy/1/<facets>?sc=1` lists facet values. VTEX documents both as needing no authentication. Responses are cached (`cache-control: public, max-age=600`).

- Facets are path segments of `key/value-slug`: `tipo-de-producto/gaseosa`, `brand/coca-cola`. Filtering by Tipo needs no text query. Facet values come as slugs with names and counts (`{"value":"gaseosa","name":"Gaseosa","quantity":415}`), so the adapter asks the facets endpoint for the slug of a Tipo or brand before searching.
- Other facet keys seen: `category-1` to `category-3`, `price`, `envase-tipo`, `productclusternames`.
- `regionId` changes the result to the region's products and prices (Sprite 17427 cost 5530 at 5000 against 6000 without a region). `zip-code` and `country` change nothing.
- `hideUnavailableItems=true` drops products whose `AvailableQuantity` is 0. `AvailableQuantity` is a flag, not a stock count: 10000 means available.
- `sort=price:asc` sorts by package price; `sort=discount:desc` sorts by `ListPrice` against `Price` only, without card promotions.
- `count` is ignored unless `page` is also sent, and its maximum is 100 (`count=101` answers `INVALID_PARAMETERS`). `page` goes up to 50, so one filter reaches at most 5,000 products.
- Teasers are structured: a `name`, `conditions.minimumQuantity` and `effects` such as `PercentualDiscount`. A promotion's unit cap and dates appear only in its name ("PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10").
- `priceRange.sellingPrice` is not the price charged; only the simulation gives it.
- Product properties include `Tipo de producto`, `Gramaje de unidad de medida` (GRM, ML, CM3, KGM, UNI, M21, ...) and `Gramaje de unidad de consumo`, which give a product's measure.
- A text segment in the older path form (`/api/io/_v/api/intelligent-search/product_search/<text>`) is read as a facet and returns the default list; text goes in `?query=`.

## Checkout simulation

`POST /api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0` prices a cart without creating one. VTEX documents it as needing no authentication.

- Body: `{"items":[{"id":"3807","quantity":2,"seller":"1"}],"country":"ARG","postalCode":"1425"}`. Money comes in cents.
- `RnbBehavior=0` applies every promotion as at the cart stage; without it VTEX uses `1`.
- A quantity promotion applies to every unit once its minimum is reached: Coca-Cola 2,25 (sku 3807, 6000) costs 6000 at 1 and 4500 each at 2 or 3.
- A quantity promotion also fires across different SKUs in one simulation (3807 and 11187 at one each triggered "2do al 50%" on 3807), so the candidates of one Item are simulated apart.
- Products sold by weight are bought in steps of `unitMultiplier` (banana 0.5: quantity 2 is 1 kg); a fractional `quantity` answers `CHK0023` "Cantidad de item inválida".
- `availability` per item is `available`, `withoutStock`, `cannotBeDelivered` or `withoutPriceFulfillment`; only `available` can be sold. Search and simulation can disagree without a region.
- Card promotions appear only with payment data: `"paymentData":{"payments":[{"paymentSystem":"502","bin":"507858","installments":1,"value":600000,"referenceValue":600000}]}` (502 is "Tarjeta Carrefour Mastercard") took sku 3807 from 6000 to 4800 ("Tarjeta Carrefour 20% Off Martes"), and at quantity 2 to 3900 each with "2do al 70% Tarjeta Carrefour", a promotion not among the product's search teasers. Promotions replaced each other instead of stacking. A Visa BIN got no discount.
- Discounts come as negative `priceTags` per item; their names point at `ratesAndBenefitsData.rateAndBenefitsIdentifiers`, which carry the promotion names.
- One simulation of one item took 0.30 to 0.53 s, ten items 0.71 s. No item cap or rate limit is documented.

## Cart link

`/checkout/cart/add?sku=<id>&qty=<n>&seller=1&...&sc=1` adds items to a cart; `sku`, `qty` and `seller` repeat per item (VTEX tutorial: https://help.vtex.com/api/llm-content?section=tutorials&locale=en&slug=how-to-assemble-the-cart-url). VTEX ties carts to browser cookies (https://developers.vtex.com/docs/guides/headless-cart-and-checkout), so the cart is expected to be built in the browser of whoever opens the link; VTEX does not document this for the cart link itself.

A cart link never sums quantities, and what happens to the cart already there depends on the session, as observed on 2026-10-15 with Leche entera larga vida Ilolay 1 l (sku `9100`) and Yerba mate La Cumbrecita con palo 500 g (sku `105933`), starting from an empty cart and opening, in order, `9100`×1, then `105933`×1 + `9100`×2, then `105933`×1:

- Logged out (incognito), the link replaces the cart: it ends with only `105933`×1.
- Logged in, the link adds its lines and sets the quantity of lines already there: it ends with `105933`×1 + `9100`×2, so items of an earlier link stay in the cart.

## Catalog search (legacy)

`GET /api/catalog_system/pub/products/search` is what `src/adapters/carrefour/catalog-download.ts` uses to download the Catalog Snapshot.

- `fq=C:/<category path>/` filters by category; `_from` and `_to` page by 50 at most, and `_from` stops at 2,500 (VTEX known issue: https://help.vtex.com/en/known-issues/catalog-search-api-limited-to-2500-results).
- The `resources` header holds the filter's total (`resources: 0-49/1655`). A page can hold fewer products than asked while more remain, so paging stops on the total, not on a short page.
- The category tree comes from `GET /api/catalog_system/pub/category/tree/4`. Only one leaf exceeded the 2,550-product window on 2026-10-13; it was covered by sorting by name both ways.
- Each product carries Carrefour's merchandise hierarchy (`EC_Sector`, `EC_Sección`, `EC_Grupo`, `EC_Familia`, `EC_Subfamilia`) and `Tipo de producto`.
- The full pass on 2026-10-13 gave 105,336 unique products, 15,180 with stock for seller 1, 5,486 Tipo values and 1,648 products without a Tipo.

## The grocery departments and Tipo

Over the 37,673 products of the ten grocery departments (2026-10-13), `Tipo de producto` covered 99.1% of products and `EC_Subfamilia` 97.2%. The share of products whose unit group differs from the majority of their group was 10.3% for Familia (339 groups), 5.7% for Subfamilia (1,379), 5.4% for Tipo (2,131) and 4.1% for Tipo + Subfamilia (5,160). Familias such as "OTRAS MARCAS" and "MARCA PROPIA" group by brand ownership and hold eggs and chicken cuts; "Huevos color" products sit in Subfamilia BLANCO; Subfamilia HUEVOS under CHOCOLATE PASCUAS holds 88 chocolate eggs. Tipo separates those cases ("Huevos blancos", "Huevos color", "Huevo de chocolate"). This is why ADR 0001 maps by Tipo.

## Not public

The Promotions & Taxes API (`/api/rnb/pvt/...`) needs a VTEX license resource, so no public endpoint returns promotion rules (dates, unit caps).

## Fixtures

Recorded answers live in `src/adapters/carrefour/fixtures/` and are read by `src/adapters/carrefour/carrefour-store.test.ts` through a fake `HttpClient`, so tests make no live calls.

| Fixture | Records |
| --- | --- |
| `regions.json` | A region with sellers for 1425 |
| `regions-empty.json` | A region with no sellers |
| `regions-rejected.json` | The `ORD006` rejection of a postal code |
| `facets-query-gaseosa.json`, `facets-query-banana.json` | The Tipo slug found by a text query |
| `facets-tipo-gaseosa.json` | The brand slugs inside a Tipo |
| `search-gaseosa-coca-cola.json`, `search-gaseosa-coca-cola-pepsi.json` | A search by Tipo and one or two brands |
| `search-banana.json` | A product sold by weight, with `unitMultiplier` |
| `simulation-promotion.json` | A quantity promotion ("2do al 50%") at quantity 2 |
| `simulation-unavailable.json` | An item with availability `cannotBeDelivered` |
| `simulation-banana.json`, `simulation-two.json` | A weighed item and a two-unit item; no test reads them today |
