# Which discounts and promotions can a program read from the carrefour.com.ar VTEX APIs this repo consumes?

Consulted 2026-10-14 (a Wednesday). Marks: **[V]** verified in the cited doc or in a live response, **[I]** inference, **[?]** not verified.

Primary sources:
- VTEX OpenAPI specs, github.com/vtex/openapi-schemas at commit `f308262f5ddbcd533fc7ccdc7222c48e67af8c1c`: `VTEX - Intelligent Search API - v1.json`, `VTEX - Checkout API.json`, `VTEX - Search API.json`, `VTEX - Promotions & Taxes API.json` (rendered at https://developers.vtex.com/docs/api-reference/intelligent-search-api-v1, .../checkout-api, .../search-api, .../promotions-and-taxes-api).
- VTEX Help Center, Progressive Discount: https://help.vtex.com/api/llm-content?section=tutorials&locale=en&slug=progressive-discount (path `docs/en/tutorials/promotions-and-taxes/promotions/creating-promotions/progressive-discount.md`).
- Live anonymous requests to https://www.carrefour.com.ar, no cookies, about 200 in total:
  - Intelligent Search v1 `GET /api/intelligent-search/v1/product-search/trade-policy/1/category-1/{department}?sc=1&hideUnavailableItems=true&count=100&page=N[&sort=discount:desc][&regionId=...]`: 18 departments x 3 pages without `regionId` (4,606 distinct products) and 18 x 2 pages with the `regionId` of postal code 1425 (3,023 distinct products). 93 requests.
  - Regions `GET /api/checkout/pub/regions?country=ARG&postalCode=1425`.
  - Checkout simulation `POST /api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0` (and `RnbBehavior=1` twice), postal code 1425 unless stated: 92 requests.
  - Legacy catalog search `GET /api/catalog_system/pub/products/search?fq=skuId:{id}&sc=1` (the endpoint `scripts/carrefour-catalog.ts` uses): 2 requests.
  - Promotions & Taxes private routes: 4 requests.

Scope note: sibling files in this folder were read only to know what to re-check. Every claim below comes from the requests or docs above.

## Answer

A program can read, without login:

1. **Quantity promotions** (2do al X%, 2x1, 3x2): fully structured in search `teasers` (`conditions.minimumQuantity`, `SkuIdsList` or `CollectionsIdsList`, `effects.PercentualDiscount`). The effect value is the average discount per unit once the minimum is reached (2do al 70% gives 35, 3x2 gives 33.33), and the simulation applies exactly that value to every unit (also odd quantities). This is the most reliable kind.
2. **Card promotions keyed by BIN** ("Tarjeta Carrefour 15%"): structured (`RestrictionsBins` list, `PercentualDiscount`). The simulation applies it when `paymentData.payments[].bin` is in the list, whatever the `paymentSystem`. In the simulation, `matchedParameters` also shows the rule's scope (seller, excluded categories, products and collections).
3. **Card quantity promotions** ("2do al 70% Tarjeta Carrefour o Cuenta digital"): **not** in search teasers. They appear only in the simulation's `ratesAndBenefitsData.teaser` list (structured `SkuIdsList`, `minimumQuantity`, `PercentualDiscount`), and in search only as free text in product properties (`Tarjeta Mi Carrefour Crédito`, `Tarjeta Mi Carrefour Prepaga`). The simulation applies them for `paymentSystem` 502 or 505. The required payment system shows up only in `matchedParameters.paymentMethodId` after the promotion fires.
4. **Installment-count promotions** ("Adicional 20% Off en 1 pago", Electro): structured (`MinInstallmentCount`/`MaxInstallmentCount`, `PercentualDiscount`). The simulation applies them with `installments: 1` and not with 6, for any of the payment systems tried.
5. **Promotions already applied to the price** ("PROMO-35% Off …", "Exclusivo online X% Off", "Mi CRF … Dto de N% Doble Precio"): included in search `Price`, named in `discountHighlights`, and only the name carries the percentage. "Mi CRF" (loyalty) discounts are applied to anonymous simulations.
6. **Price-list reductions** (`ListPrice` > `Price` with no promotion): `ListPrice` is a "before" price. `PriceValidUntil` often gives the end date of the reduced price.
7. **Gifts**: `GiftSkuIds` in search and `selectableGifts` in the simulation.
8. **Interest-free installments**: only as text in properties (`Combinalo`: "6 CUOTAS SIN INTERÉS") and as `InterestRate` 0 entries in `Installments` / `installmentOptions`. These are financing terms, not price discounts.

Structured vs name-only: minimum quantity, percentage, eligible SKUs or collection, BIN list, installment count and payment method (simulation only) are structured. Unit caps ("Max 8 unidades"), dates ("9 al 15.10"), "Combinable"/"Iguales", "Exclusivo online", "Mi Crf" and the percentage of discount-highlight promotions are **only in the name**. The names are not reliable: 14 to 25 teasers called "2do al 70%" carry `PercentualDiscount` 25, and the simulation applied 25. Promotions did not stack in any of the 8 combinations tried; each time the simulation kept one discount per item, the largest. The "Max N unidades" caps were not enforced by the simulation (35% still applied at 9, 12 and 17 units). Promotion rules (dates, caps, accumulation settings) are only in the private `/api/rnb/pvt/...` routes, which answer 401 without credentials.

## Endpoints and what each exposes

### Intelligent Search v1 product search

- [V] Public: "This endpoint does not require authentication or permissions" (IS v1 spec, `GET /product-search/{facets}`).
- [V] Offer fields that carry discount information, with their VTEX descriptions (IS v1 spec, `commertialOffer`):
  - `Price` "Price of the item." `ListPrice` "List price of the item." `PriceWithoutDiscount` "Price without discount."
  - `spotPrice` "Special promotional price available under specific conditions, such as a discount for a specific payment method. May differ from `Price`."
  - `teasers` "Promotion teasers."; `conditions` "Conditions for the promotion to be valid."; `minimumQuantity` "Minimum quantity of the item."; `effects` "Promotion effects."
  - `discountHighlights` "Discount highlights." `GiftSkuIds` "List of gift SKU IDs." `RewardValue` "Credit the customer receives when finalizing an order that includes this SKU." `PriceValidUntil` "Date until the price is valid, in ISO 8601 format." `Installments` "Installments information."
  - Product level: `productClusters` "Product clusters (collections) the product belongs to." `clusterHighlights` "Cluster highlights information."
- [V] Example teaser (live, sku 279184): `{"name":"PROMO-2do al 70% Max 8 unidades Combinable HELLMANNS-Reg-2-70-Aniv2 9 al 15.10","conditions":{"minimumQuantity":2,"parameters":[{"name":"SkuIdsList","value":"114777,199098,279184,…"}]},"effects":{"parameters":[{"name":"PercentualDiscount","value":"35"}]},"generalValues":[]}`.
- [V] Search `Price` depends on `regionId`. Sku 279184 without `regionId`: `Price` 2397.5, `ListPrice` 3425. With the `regionId` of 1425: `Price` 3425, which matches the simulation (`price` 342500). Counts below come from both samples. Prices are only comparable with a `regionId`.

### Legacy catalog search (`/api/catalog_system/pub/products/search`)

- [V] Offer keys live: `Teasers`, `PromotionTeasers`, `DiscountHighLight`, `GiftSkuIds`, `PaymentOptions`, `Installments`, `Price`, `ListPrice`, `PriceWithoutDiscount`, `FullSellingPrice`, `RewardValue`, `PriceValidUntil`. Search API spec: `Teasers` "List with teasers information.", `PromotionTeasers` "List with promotions teasers information.", `DiscountHighLight` "Discount hightlights."
- [V] Quantity teasers have no parameters here. Sku 14192: `{"Name":"PROMO-2do al 50% Max 8 unidades Combinable MOLINOS ALA-…","Conditions":{"MinimumQuantity":2,"Parameters":[]},"Effects":{"Parameters":[]}}`. Only the BIN teaser keeps its parameters. `Teasers` uses .NET-serialized keys (`"<Name>k__BackingField"`).
- [I] For promotions, the legacy endpoint is strictly poorer than Intelligent Search: no SKU list and no percentage for quantity promotions.

### Checkout simulation

- [V] Public: "This endpoint does not require authentication or permissions." `RnbBehavior`: "Use `0` for simulations at cart stage, which means all promotions apply. In case of window simulation use `1`, which indicates promotions that apply nominal discounts over the total purchase value shouldn't be considered… if this not sent, the parameter is `1`." (Checkout spec).
- [V] Field meanings (Checkout spec, simulation response):
  - `items[].price` "Price in cents." `listPrice` "List price in cents." `sellingPrice` "Selling price in cents… may be subject to rounding discrepancies. We recommend retrieving data from the `priceDefinition` data structure instead."
  - `priceTags` "Array of price tags, each of which, modifies the price in some way, like discounts or taxes." `priceTags[].name` "format: `{type}@{where}-{identifier}#{calculationId}`… `identifier` is the promotion ID." `value` "representing either a promotion (value decrease) or a tax (value increase)." `isPercentual` "Indicates whether the `value` and `rawValue` … represent a percentage." `identifier` "Promotion unique identifier."
  - `priceDefinition` "Price information for all units of a specific item." `sellingPrices` "value (in cents) and quantity for the different rounding instances".
  - `ratesAndBenefitsData` "Information on pricing and promotions that apply to the order." with `rateAndBenefitsIdentifiers` ("List with pricing and promotions identifiers.") and `teaser`.
  - `paymentData.paymentSystems` "Information on payment systems." and `installmentOptions` "List of Installment options."
- [V] Spec vs live: the spec types `rateAndBenefitsIdentifiers` items as strings. Live they are objects: `{"id":"888c38ba-…","name":"PROMO-2do al 70% … HELLMANNS…","featured":true,"description":"02500676","matchedParameters":{"progressiveDiscount@Marketing":"279184"},"additionalInfo":null,"triggeredBy":null,"isCupomDiscount":null}`.
- [V] Live `priceTags[].identifier` was always `null`. The promotion ID is the part of `name` between `discount@price-` and `#`, and it equals `rateAndBenefitsIdentifiers[].id`. All tags seen had `isPercentual: false` and a negative `value` in cents for the whole line.
- [V] `ratesAndBenefitsData.teaser` lists promotions the cart has **not** triggered yet, with `teaserType` (`Catalog` for quantity promotions, `Profiler` for the BIN promotion), conditions and effects. A promotion drops out of this list once it applies.
- [V] `totals` has `Items` and `Discounts` (e.g. `{"id":"Discounts","name":"Total de descuentos","value":-239750}`).
- [V] Payment systems in the response (sku 279184): 1 American Express, 2 Visa, 4 Mastercard, 10 Visa Electron, 16 Vale, 33 Cabal, 35 Naranja, 39 Maestro, 127 MercadoPagoPro, 502 Tarjeta Carrefour Mastercard ("Tarjeta Abierta"), 505 Prepaga BSF ("Tarjeta prepaga Mastercard BSF Prepaga").

## Promotion kinds observed

Sample A: no `regionId`, 4,606 products, 5,655 offers, 4,260 teasers. Sample B: `regionId` of 1425, 3,023 products, 3,831 offers, 2,475 teasers. Counts are teasers on the first item of each product, all sellers. Marketplace sellers (`Producteca…`, `bigstarsar`, `limansky653`) had no teasers and no `discountHighlights` in any offer (854 offers in sample A).

### Teaser structure (search)

- [V] Effect parameter names: only `PercentualDiscount` (4,260 of 4,260 in A, 2,475 of 2,475 in B). Not seen: `NominalDiscount`, `MaximumUnitPriceDiscount` or any other effect. `generalValues` was always `[]`.
- [V] Condition parameter sets (A / B):

| Condition parameters | A | B | minimumQuantity | Kind |
| --- | --- | --- | --- | --- |
| `RestrictionsBins` | 3,647 | 2,133 | 0 | "Tarjeta Carrefour 15%" |
| `SkuIdsList` | 430 | 271 | 2 or 3 | 2do al X%, 2x1, 3x2 |
| `CollectionsIdsList` | 121 | 42 | 2 or 3 | 2do al X%, 3x2 on a collection |
| `MinInstallmentCount`+`MaxInstallmentCount` (1,1) | 45 | 29 | 0 | "Adicional N% Off en 1 pago" (Electro) |
| `PaymentMethodId` (502) | 17 | 0 | 0 | "10% Off Tarjeta Carrefour Dia de la madre" |

- [V] `minimumQuantity` values: 0 (3,709 A), 2 (458 A), 3 (93 A). No value above 3.
- [V] `PercentualDiscount` values in A: 15 (3,653), 35 (209), 25 (197), 33.33 (93), 40 (43), 10 (32), 20 (24), 50 (9).
- [V] The `RestrictionsBins` value was the same everywhere: `507858,858110,858111,585274,538156,520225,539958,527061,898989`.
- [V] The card teaser appears in most food departments but not in all offers: in sample A it was present on 0/290 Electro y tecnología, 61/200 Carnes y pescados, 78/152 Indumentaria, 287/287 Almacén, 278/280 Bebidas.
- [V] Distinct teaser names: 138 in A, 101 in B.

### Name patterns (only in text)

- [V] Carrefour names quantity promotions `PROMO-<label>-Reg-<minQty>-<percent>-<campaign>`, for example `PROMO-2do al 50% Max 8 unidades Combinable MOLINOS ALA-Reg-2-50-Aniv2 9 al 15.10`. Labels seen: "2do al 50/70/80%", "2x1", "3x2", with qualifiers "Max N unidades" (N = 6, 8, 12, 24, 48, 72), "Combinable", "Iguales", "Mi Crf", "Exclusivo online", and dates such as "9 al 15.10", "9/10 al 22/10".
- [V] In sample A, `-Reg-<q>-<p>-` matched the structured `minimumQuantity` in every quantity teaser. `PercentualDiscount` equalled `p/q` in 496 of 521 (2-70 to 35, 2-50 to 25, 3-100 to 33.33, 2-80 to 40, 2-100 to 50). It did not match in 25 teasers named "2do al 70%" that carry 25 (Virulana, Rolopac, Fragancias, AsurinAstan).
- [V] For "Adicional N% Off en 1 pago" the name encodes `-Reg-1-0-` while the effect is 10, 15 or 20: the name code is not the effect.
- [V] `discountHighlights` names (57 distinct in A, 968 offers): "PROMO-35% Off Max 8 unidades -Reg-1-35-Aniv2 9 al 15.10", "PROMO-Exclusivo online 40% Off -Reg-1-40-Nestle9/10 al 15/10", "PROMO-Mi CRF -mfl-1-9-Dto de 9% Doble Precio", "PROMO-20% Off -Reg-1-20-Aniv2 BAZAR", "Exclusivo online Gratis Bolsa Carrefour". Each is `{"name":…, "additionalInfo":[]}`: the percentage is only in the name.
- [V] Product properties with promotion text (sample A, products): `Combinalo` (651, "6 CUOTAS SIN INTERÉS", "12 CUOTAS SIN INTERÉS", …), `Tarjeta Mi Carrefour Crédito` (712 with any value; 149 "2do al 70% Carrefour credito", 394 "6 CSI MI CARREFOUR CRÉDITO", …), `Tarjeta Mi Carrefour Prepaga` (152; 149 "2do al 70% Cuenta digital"), `Ahora 12` (53, "12 CUOTAS FIJAS CON VISA"). None of these products had a matching card teaser in search.
- [V] `clusterHighlights`: 30 products in A, names "Marketplace - Días de las Madres", "banner quilmes", "Lanzamiento aspiradoras robot - Marketplace". `productClusters` lists many collection names that read like campaigns, including past ones (sku 393964: "AS - 20 A 28 MAYO - 2do al 50%"). [I] Cluster names are not evidence of an active promotion.

### Price fields (search)

- [V] Sample B, seller 1 offers (3,088): `discountHighlights` present and `Price` < `ListPrice` in 768; `Price` < `ListPrice` without highlights in 205; `spotPrice` ≠ `Price` in 101.
- [V] `spotPrice` ≠ `Price` happened only on items sold by weight, and always `spotPrice = Price × unitMultiplier` (187 of 187 across both samples, e.g. sku 106115, 4290 x 0.5 = 2145). The simulation charged `sellingPrice` 214500 for one 0.5 kg step without any price tag. [I] On this store `spotPrice` shows the price of one sale step, not a payment-method discount, despite the spec wording.
- [V] "Mi CRF … Doble Precio" offers have three distinct prices. Sku 221084: `ListPrice` 4390, `PriceWithoutDiscount` 2390, `Price` 2222.7. In the simulation, `listPrice` was 439000, `price` 239000 and the 7% tag led to `sellingPrice` 222270.
- [V] A Mi CRF discount can be in `Price` without being in `discountHighlights`. Sku 246914 had no highlight in search, but the simulation tagged "PROMO-Mi CRF -mfl-1-11-Dto de 11% Doble Precio" with `matchedParameters` `forThePriceOf@Marketing`.
- [V] `Price` < `ListPrice` with no promotion is a price-list reduction. Sku 248935: search `Price` 2990, `ListPrice` 4390; simulation `price` 299000, `listPrice` 439000, no price tag.
- [V] `PriceValidUntil` (sample B, seller 1): for offers with `Price` < `ListPrice` and no highlight, 153 of 179 end between 2026-10-15 and 2026-12-02. For offers without any discount, 2,034 of 2,034 end in 2027 or later. 557 of 559 offers with a non-Mi CRF highlight end in 2027 or later. [I] `PriceValidUntil` gives the end of a price-list reduction but not the end of a promotion.
- [V] `RewardValue` was 0 in all offers. `BuyTogether` was empty in all offers. `GiftSkuIds` was non-empty in 95 offers (A), e.g. sku 71726 `["116192","178271"]` with highlight "Exclusivo online Gratis Bolsa Carrefour".
- [V] `Installments` lists, per payment system, counts with `InterestRate` 0 beyond one payment for some products (A: 532 products with 6 interest-free payments for Visa/Mastercard, 150 with 12). These are financing terms, not price discounts.

## Do simulations match the teasers?

All simulations: seller "1", postal code 1425, `RnbBehavior=0` unless stated. Cents.

| Kind (sku) | Quantity / payment | Result |
| --- | --- | --- |
| 2do al 70%, SkuIdsList, eff 35 (279184, 3425) | 1 | 342500, no tag |
| same | 2, 3, 8, 9, 10, 16, 17 | 222625 per unit (35% off every unit) |
| 2do al 80%, CollectionsIdsList, eff 40 (184074) | 1 / 2 / 3 | 64500 / 38700 / 38700 per unit |
| 3x2, CollectionsIdsList, eff 33.33 (154326) | 2 / 3 / 4 / 6 | 599000 / 399353 per unit at 3, 4 and 6 |
| 2x1, SkuIdsList, eff 50 (271887) | 2 / 3 | 254500 per unit (50% on all 3 at quantity 3) |
| "2do al 70%" named, eff 25 (17721) | 2 | 64425 per unit = 25% off, the structured value |
| 2do al 70% Mi Crf (149037), anonymous | 2 | 35% applied |
| 2x1 Mi Crf Iguales (263522), anonymous | 2 | 50% applied |
| Tarjeta Carrefour 15% (279184) | paymentSystem 502, bin 507858 | 291125 (15%) |
| same | 502 without bin; 502 bin 450995; 505 without bin | no discount |
| same | 505 bin 507858; 2 (Visa) bin 507858 | 15% applied |
| same | 1, 4, 10, 16, 33, 35, 39, 127 with other or no BINs | no discount |
| Card 2do al 70% (14192, not a search teaser) | 2, no payment | search teaser "2do al 50%" applied (25%) |
| same | 2 or 3, paymentSystem 502 bin 507858; 2 with 505 bin 507858 | 126750 per unit (35%); `matchedParameters.paymentMethodId` "502" / "505" |
| Adicional 20% Off en 1 pago (282002) | none / Visa 6 installments | no discount |
| same | Visa, 502 or 127 with `installments: 1` | 20% applied |
| 35% Off Max 8 unidades, highlight (150485) | 1, 8, 9, 12 | 35% on every unit; the cap was not applied |
| Mi CRF 7% Doble Precio (221084) | 1, anonymous | 7% applied |
| 10% Off Tarjeta Carrefour Dia de la madre (257750, 257784, 280645, 284975) | any | `cannotBeDelivered` at 1425 and 5000; no promotion computed. **Not verified** |

- [V] `matchedParameters` reveals the rule scope. Quantity promotions: `{"progressiveDiscount@Marketing":"279184"}`; when two different SKUs of the list are in the cart: `"279184,279176"`. Collection-based highlight: `{"productCluster@CatalogSystem":"26882|inclusive"}`. BIN promotion: `{"Seller@CatalogSystem":"1|inclusive","category@CatalogSystem":"322,325,3,326,324,323|exclusive","product@CatalogSystem":"99999,745640,…|exclusive","productCluster@CatalogSystem":"23775,24875|exclusive","restrictionsBins":"507858"}`.
- [V] A quantity promotion fires across different SKUs of the same `SkuIdsList`: 279184 x1 + 279176 x1 gave 35% on both lines.
- [V] VTEX Progressive Discount doc: the discount is "the discount percentage applied when the minimum quantity of items defined is reached", conditions can be "SKUs" or "Collections", and "Must be the same item" restricts it to one SKU. Usage restrictions include "Limit the number of eligible items per cart". [I] The Carrefour quantity promotions behave as Progressive Discounts: `progressiveDiscount@Marketing` in `matchedParameters`, a flat average percentage on every unit at or above the minimum. "Iguales" in the name probably maps to "Must be the same item". Neither "Iguales" nor any item limit is exposed in a structured field.
- [V] The "Max N unidades" item limit was not enforced in any simulation (279184 up to 17 units with "Max 8"; 150485 up to 12 with "Max 8"). [?] Whether checkout enforces it at order placement is not known; it is not visible in any field.

### Stacking

- [V] In 8 combinations each line got exactly one discount tag: the largest available.
  - 279184 at 2 with card: 35% quantity promotion, not also 15%.
  - 79221 at 2: 35% "2do al 70%" replaced the 35% "Exclusivo online" highlight; with card, still only that one.
  - 150485 with card: 35% highlight, no 15%.
  - 221084 with card: 15% replaced the 7% Mi CRF.
  - 271887 at 2: 2x1 50% replaced the 10% Mi CRF.
  - 14125 at 3: "2do al 70% BUDWEISER" 35% won over "3x2 Iguales" 33.33%.
  - 14192 at 2 with card: card 2do al 70% (35%) won over 2do al 50% (25%) and card 15%.
- [I] The pattern is consistent with VTEX promotion competition (the best promotion wins) and no accumulation, despite "Combinable" in names. [?] The accumulation setting of each promotion is not exposed; the VTEX doc found describes "combination and competition" only as "Allow combining with manual prices".
- [V] `RnbBehavior=1` gave the same result as `0` for 279184 at 2 and 14192 at 2 with card. [I] It only matters for nominal discounts over the order total, and none were seen.
- [V] The marketplace offer (227783, seller Producteca232621) had `listPrice` 5217000 and `price` 968700 with no tag, also with the card BIN. The BIN rule's `Seller@CatalogSystem` is `1|inclusive`.

### Day of week

- [V] On Wednesday 2026-10-14 the only BIN teaser was "Tarjeta Carrefour 15%" with effect 15 in every sampled offer that had one. [?] Whether the card name or percentage changes on other weekdays (for example a Tuesday-only percentage) was not tested: it needs the same request on another day. [I] A program should read the BIN teaser and its effect on each run and not hard-code the percentage.

## What the APIs do not expose

- [V] Promotion rules (start and end date, item and usage limits, accumulation, customer clusters) are only in the Promotions & Taxes API, under `/api/rnb/pvt/...`. Its spec says: "Any user or API key must have at least one of the appropriate License Manager resources … Otherwise they will receive a status code `403` error", resource **GerenciarPromocoesETarifas**. Live anonymous `GET https://www.carrefour.com.ar/api/rnb/pvt/benefits/calculatorconfiguration`, `/api/rnb/pvt/calculatorconfiguration/1`, `/api/rnb/pvt/campaignConfiguration` and `https://carrefourar.vtexcommercestable.com.br/api/rnb/pvt/benefits/calculatorconfiguration` all answered **401**.
- [V] Not exposed in structured form: promotion dates (only in names like "9 al 15.10"); unit caps ("Max N unidades", not enforced in simulation); same-SKU-only ("Iguales"); the payment method a card quantity promotion needs (only in `matchedParameters` after it fires); the percentage of highlight promotions (only in the name, or derivable from `Price`/`PriceWithoutDiscount`); interest-free installment campaigns (only property text, or `InterestRate` 0 in installments).
- [V] Search does not show card quantity promotions as teasers (14192: search had "Tarjeta Carrefour 15%" and "2do al 50%"; the simulation teaser list added "2do al 70% Tarjeta Carrefour o Cuenta digital Max 8 Combinable 9 al 15.10 MOLINOS ALA").
- [V] No `NominalDiscount`, `MaximumUnitPriceDiscount`, fixed-amount or coupon (`isCupomDiscount` always `null`) promotion was observed. [?] Absence in about 7,600 products sampled is not proof that the store never uses them.
- [?] Bank promotions for non-Carrefour cards: none of the payment systems 1, 2, 4, 10, 16, 33, 35, 39, 127 triggered any discount with the BINs tried (450995, 517562, 376411, 589657, 589562, 491580, 501041; these BINs were chosen by me and may not belong to the banks behind real campaigns). The simulation only reacts to the BIN and payment system sent, so a bank promotion would show up only if the right BIN is sent.
- [?] Unverified: the "PaymentMethodId 502" teaser kind (no deliverable SKU at 1425 or 5000), and whether `selectableGifts` adds a gift line to an available item (the only gift SKU tried was `cannotBeDelivered`; `selectableGifts` still listed gift 116192).

## How a program should read promotions

- [I] Use Intelligent Search with `regionId` to list structured quantity teasers (`minimumQuantity`, `PercentualDiscount`, `SkuIdsList`/`CollectionsIdsList`). Treat the `PercentualDiscount` as the average discount on every unit once the minimum is reached, and ignore the name's percentage.
- [I] Use the simulation as the source of truth for the final price. Read `priceDefinition.total`, map `priceTags[].name` to `rateAndBenefitsIdentifiers[].id`, and read `ratesAndBenefitsData.teaser` to discover promotions that a larger quantity or a card would unlock, including card quantity promotions that search hides.
- [I] To price a card, send `paymentData.payments` with both `paymentSystem` and a `bin` in the `RestrictionsBins` list. For "1 pago" promotions, send `installments: 1`.
- [I] Expect only one promotion per item (the largest), and do not rely on name-only caps or dates.
