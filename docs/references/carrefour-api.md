# Carrefour API

Facts about the public endpoints of https://www.carrefour.com.ar that the code depends on. carrefour.com.ar runs on VTEX; every endpoint below answers anonymous requests without cookies. The facts were checked with live requests on 2026-10-13 and against the VTEX API reference (https://developers.vtex.com/docs/api-reference/checkout-api). The adapter is `src/adapters/carrefour/carrefour-store.ts`; the full catalog download is `src/adapters/carrefour/catalog-download.ts`, run by `pnpm carrefour:catalog`.

## Regions

`GET /api/checkout/pub/regions?country=ARG&postalCode=<code>` turns a postal code into a region.

- It answers a list with one region: a base64 `id` and the branch `sellers` that serve it (for example `carrefourar0026` "Hiper Warnes" for 1425, `carrefourar0009` "Hiper Córdoba Colón" for 5000).
- A region with no sellers, or an empty list, means Carrefour does not deliver there.
- A postal code Carrefour does not accept answers HTTP 400 with `error.code` `ORD006` ("El campo código postal (abc) del anexo de envío es no válido").
- The simulation takes the postal code itself, not the region.

## Checkout simulation

`POST /api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0` prices a cart without creating one. VTEX documents it as needing no authentication.

- Body: `{"items":[{"id":"3807","quantity":2,"seller":"1"}],"country":"ARG","postalCode":"1425"}`. Money comes in cents.
- `RnbBehavior=0` applies every promotion as at the cart stage; without it VTEX uses `1`.
- A quantity promotion applies to every unit once its minimum is reached: Coca-Cola 2,25 (sku 3807, 6000) costs 6000 at 1 and 4500 each at 2 or 3.
- A quantity promotion also fires across different SKUs in one simulation (3807 and 11187 at one each triggered "2do al 50%" on 3807), so the candidates of one Item are simulated apart.
- Products sold by weight are bought in steps of `unitMultiplier` (banana 0.5: quantity 2 is 1 kg); a fractional `quantity` answers `CHK0023` "Cantidad de item inválida".
- `availability` per item is `available`, `withoutStock`, `cannotBeDelivered` or `withoutPriceFulfillment`; only `available` can be sold.
- Card promotions appear only with payment data: `"paymentData":{"payments":[{"paymentSystem":"502","bin":"507858","installments":1,"value":600000,"referenceValue":600000}]}` (502 is "Tarjeta Carrefour Mastercard") took sku 3807 from 6000 to 4800 ("Tarjeta Carrefour 20% Off Martes"), and at quantity 2 to 3900 each with "2do al 70% Tarjeta Carrefour", a promotion not among the product's search teasers. Promotions replaced each other instead of stacking. A Visa BIN got no discount.
- Discounts come as negative `priceTags` per item; their names point at `ratesAndBenefitsData.rateAndBenefitsIdentifiers`, which carry the promotion names.
- One simulation of one item took 0.30 to 0.53 s, ten items 0.71 s. No item cap or rate limit is documented.

## Cart link

`/checkout/cart/add?sku=<id>&qty=<n>&seller=1&...&sc=1` adds items to a cart; `sku`, `qty` and `seller` repeat per item (VTEX tutorial: https://help.vtex.com/api/llm-content?section=tutorials&locale=en&slug=how-to-assemble-the-cart-url). VTEX ties carts to browser cookies (https://developers.vtex.com/docs/guides/headless-cart-and-checkout), so the cart is expected to be built in the browser of whoever opens the link; VTEX does not document this for the cart link itself.

A cart link never sums quantities, and what happens to the cart already there depends on the session, as observed on 2026-10-15 with Leche entera larga vida Ilolay 1 l (sku `9100`) and Yerba mate La Cumbrecita con palo 500 g (sku `105933`), starting from an empty cart and opening, in order, `9100`×1, then `105933`×1 + `9100`×2, then `105933`×1:

- Logged out (incognito), the link replaces the cart: it ends with only `105933`×1.
- Logged in, the link adds its lines and sets the quantity of lines already there: it ends with `105933`×1 + `9100`×2, so items of an earlier link stay in the cart.

A cart link does not keep each `qty` with its `sku`. Carrefour's checkout sorts the `sku` values and the `qty` values separately, both as text, and pairs them by position, as observed on 2026-10-15 with a fresh cookie jar and `POST /api/checkout/pub/orderForm` to read the cart:

- `sku=11324&qty=4&sku=19873&qty=1` ends with `11324`×1 and `19873`×4, and so does the same link with its lines in the other order.
- `sku=11324&qty=4&sku=19873&qty=10` ends with `11324`×10 and `19873`×4, since `"10"` sorts before `"4"`.
- A link with one line, or with every `qty` equal, gets the right quantities.
- A `qty` with leading zeros is read as its number: `qty=04` buys 4. So `cartLink` in `src/adapters/carrefour/carrefour-store.ts` writes the lines in the text order of their `sku` and pads each `qty` with one zero fewer than the line before it, which puts the quantities in the same text order. A link of 11 lines built this way got every quantity right, logged out and logged in.
- The same `sku` repeated with `qty=1` does not add up: four lines of `11324` end with `11324`×1.
- A cart built with `POST /api/checkout/pub/orderForm/<id>/items` keeps its quantities, and opening `/checkout/?orderFormId=<id>` in a logged-in browser shows it, but the page then asks for a delivery method and redirects to the home page, where the account's own cart comes back. In an incognito window the Owner saw an empty cart.
- Logged in, links opened one after the other each add their lines with the right quantities: `19873`×1 + `249859`×1, then `11324`×4, ended with both links' lines next to the line already in the cart.

## Catalog search (legacy)

`GET /api/catalog_system/pub/products/search` is what `src/adapters/carrefour/catalog-download.ts` uses to download the Catalog Snapshot.

- `fq=C:/<category path>/` filters by category; `_from` and `_to` page by 50 at most, and `_from` stops at 2,500 (VTEX known issue: https://help.vtex.com/en/known-issues/catalog-search-api-limited-to-2500-results).
- The `resources` header holds the filter's total (`resources: 0-49/1655`). A page can hold fewer products than asked while more remain, so paging stops on the total, not on a short page.
- The category tree comes from `GET /api/catalog_system/pub/category/tree/4`. Only one leaf exceeded the 2,550-product window on 2026-10-13; it was covered by sorting by name both ways.
- Each product carries Carrefour's merchandise hierarchy (`EC_Sector`, `EC_Sección`, `EC_Grupo`, `EC_Familia`, `EC_Subfamilia`) and `Tipo de producto`.
- Each item carries the Sale Step: `measurementUnit` is `kg` for a product sold by weight and `un` otherwise, and `unitMultiplier` is the step in kg ("Banana selección x kg.": `kg`, `0.5`; packaged products: `un`, `1`). Checked on 2026-10-15.
- Each seller's `commertialOffer` carries `PromotionTeasers`, each with a `Name` and `Conditions.MinimumQuantity` ("Gaseosa cola Coca Cola sabor original 2,25 lts": "PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10", minimum quantity 2). `Teasers` holds the same teasers with keys such as `<Name>k__BackingField`. Checked on 2026-10-15.
- `Gramaje de unidad de medida` and `Gramaje de unidad de consumo` give a packaged product's size (`CM3` `1500` is 1.5 l). A product sold by weight also has them (banana: `GRM` `1000.00`), so they are not its size. On 2026-10-13, 39,498 of 105,336 products had no `Gramaje de unidad de medida`; the units seen were `UNI`, `GRM`, `CM3`, `GRS`, `KGM`, `M21`, `LTR`, `ML`, `PAN`, `MTR`, `LM1`, `UN1`, `MIL`, `GR1` and `ML1`.
- The full pass on 2026-10-13 gave 105,336 unique products, 15,180 with stock for seller 1, 5,486 Tipo values and 1,648 products without a Tipo.

## The grocery departments and Tipo

Over the 37,673 products of the ten grocery departments (2026-10-13), `Tipo de producto` covered 99.1% of products and `EC_Subfamilia` 97.2%. The share of products whose unit group differs from the majority of their group was 10.3% for Familia (339 groups), 5.7% for Subfamilia (1,379), 5.4% for Tipo (2,131) and 4.1% for Tipo + Subfamilia (5,160). Familias such as "OTRAS MARCAS" and "MARCA PROPIA" group by brand ownership and hold eggs and chicken cuts; "Huevos color" products sit in Subfamilia BLANCO; Subfamilia HUEVOS under CHOCOLATE PASCUAS holds 88 chocolate eggs. Tipo separates those cases ("Huevos blancos", "Huevos color", "Huevo de chocolate"). This is why the search indexes each product's Tipo (ADR 0012).

## Not public

The Promotions & Taxes API (`/api/rnb/pvt/...`) needs a VTEX license resource, so no public endpoint returns promotion rules (dates, unit caps).

## Fixtures

Recorded answers live in `src/adapters/carrefour/fixtures/` and are read by `src/adapters/carrefour/carrefour-store.test.ts` and `catalog-download.test.ts` through a fake `HttpClient`, so tests make no live calls.

| Fixture | Records |
| --- | --- |
| `regions.json` | A region with sellers for 1425 |
| `regions-empty.json` | A region with no sellers |
| `regions-rejected.json` | The `ORD006` rejection of a postal code |
| `catalog-search-coca-cola-banana.json` | Three products of the catalog search, trimmed to the fields the download reads: a packaged product with a teaser, a product sold by weight and a packaged product without teasers |
| `simulation-promotion.json` | A quantity promotion ("2do al 50%") at quantity 2 |
| `simulation-unavailable.json` | An item with availability `cannotBeDelivered` |
| `simulation-banana.json` | A weighed item |
