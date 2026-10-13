# How can a program keep a fresh local mirror of the carrefour.com.ar (VTEX) catalog cheaply and fast?

Consulted 2026-10-13. Marks: **[V]** verified in the cited page or file, **[I]** my inference, **[?]** not verified.

Primary sources:
- Carrefour AR sitemap index: https://www.carrefour.com.ar/sitemap.xml (and /sitemap/product-0.xml, product-94.xml, category-0.xml)
- Category tree (live GET): https://www.carrefour.com.ar/api/catalog_system/pub/category/tree/4
- Legacy catalog search (live GET): https://www.carrefour.com.ar/api/catalog_system/pub/products/search
- Intelligent Search (live GET): https://www.carrefour.com.ar/api/io/_v/api/intelligent-search/product_search and /facets/
- Regions (live GET): https://www.carrefour.com.ar/api/checkout/pub/regions?country=ARG&postalCode=1425
- VTEX known issue: https://help.vtex.com/en/known-issues/catalog-search-api-limited-to-2500-results
- VTEX Catalog API reference (rate limit text): https://developers.vtex.com/docs/api-reference/catalog-api
- VTEX simulate a cart: https://developers.vtex.com/docs/guides/simulate-a-shopping-cart
- Sibling note: .scratch/carrefour-cart/research/carrefour-ar-cart.md

Tooling limit: no Bash/curl in this run. Every live call was a GET through WebFetch (summarised by a small model, no cookies, no headers visible, ~60 requests). Counts read from truncated pages are the summariser's estimates. POST endpoints (simulation) could not be called.

## Answer
1. Size: Intelligent Search reports 109,203 records (products); the sitemaps list roughly 95k product URLs; ~545 category URLs; tree depth up to 4 levels. SKU total not measured.
2. Legacy search: page size max 50 and `_from` max 2500 (so at most ~2550 items per filter); Intelligent Search: `count` max 100, `page` max 50 (5000 items per filter). Enumerate by splitting by leaf category (facets give counts), then by brand/price where a leaf is bigger than the cap.
3. Intelligent Search returns the same `teasers` (with promo names, some with date ranges). Ranking was identical in 3 runs for "frutilla" and "pan". The path form `/product_search/frutilla` ignores the text; use `?query=`.
4. Cheapest refresh found: legacy search with repeated `fq=skuId:` (3 SKUs worked in one call), but each product costs ~22 KB. Simulation (POST) was not testable; VTEX docs state no item limit.
5. No 429 seen in ~60 calls; response headers not visible. VTEX documents 45,000 req/min/account for the Catalog API.
6. Anonymous default is trade policy 1, seller "1". Passing a `regionId` changed the Intelligent Search result set for "frutillas"; the one SKU price checked in legacy search did not change.
7. Promotion teasers carry the promo name; one seen has a weekly range ("9 al 15.10"), which suggests weekly rotation. Card-discount teasers have no dates.

## Findings

### 1. Catalog size and category tree
- [V] Intelligent Search `product_search?count=1&page=1` (no query) returned `recordsFiltered: 109203`, `proxyUrl` containing `search/trade-policy/1?an=carrefourar`.
- [V] Sitemap index lists 104 files: product-0 to product-94 (95 files), brand-0..4, category-0, custom routes (sitemap.xml).
- [V] product-94.xml has about 746 `<url>` entries (summariser count, "could be off by a few"), each with `lastmod` 2026-10-13. product-0.xml text is ~124,783 characters, roughly 1,000 entries (estimate; page truncated at 100,000 chars).
- [I] 94 x ~1000 + ~746 gives ~95k product URLs, below the 109k Intelligent Search records. The gap may be non-indexed or non-visible products, or the estimate is off. Not checked.
- [?] SKU count: not measured. Searching `fq=skuId:` shows some products have several items; no total found.
- [V] `/api/catalog_system/pub/category/tree/0` returns 20 top-level nodes with empty `children` (depth 0 gives no nesting): e.g. Frutas y verduras (330), Almacén (161), Lácteos (292), Panadería (336). It includes "Test Category" (1) and "Gift Cards" (564).
- [V] `tree/4` returns the nested tree (166,473 characters). Under Frutas y verduras (330): Frutas 331, Verduras 332, Verduras cortadas y ensaladas preparadas 333, Frutos secos 334, all leaves.
- [?] Leaf count: the summariser estimated ~197 leaves in the second chunk alone and max depth 3 below top-level; the first chunk was not counted. category-0.xml has ~545 `<loc>` entries (estimate). Leaves are therefore in the low hundreds to ~500; exact count needs a JSON parse.
- [V] Intelligent Search facets `/facets/category-1/frutas-y-verduras` gives counts per category-2: Verduras 449, Frutas 214, Frutos secos 194, Verduras cortadas 168 (total 1025 = `recordsFiltered` of `product_search/category-1/frutas-y-verduras`). Other facet keys: tipo-de-producto, envase-tipo, price, brand, productclusternames, saludables. The root `/facets/` returned an empty `facets` list.

### 2. Pagination limits and enumeration
- [V] Legacy `fq=C:/330/331/&_from=0&_to=49` works (50 products). `_from=0&_to=99` returns HTTP 400.
- [V] Legacy `fq=C:/161/&_from=2500&_to=2549` returns products; `_from=2501&_to=2550` and `_from=5000&_to=5049` return HTTP 400. So the cap is `_from <= 2500` (max index 2549 reachable).
- [V] VTEX known issue: "When using Catalog Search API the maximum results obtained is 2500, even if there are more products." Workaround: "N/A".
- [V] `fq=C:/330/331/&_from=2500&_to=2549` returned `[]` (category has fewer products), so an empty array marks the end.
- [V] Intelligent Search: `count=100` works (page text 2,365,392 chars); `count=101` returns 400. `page=50` works; `page=51` and `page=100000` return 400. `pagination.last.index` is 50 for any count.
- [I] Intelligent Search reaches at most 100 x 50 = 5000 products per filter; with 109k products it needs filter splits just like legacy search.
- [V] Intelligent Search accepts a category path (`product_search/category-1/frutas-y-verduras`) and `query=`.
- [I] Enumeration plan the facts support: read facet counts per leaf category, page each leaf (all leaves seen so far hold far fewer than 2550), and split any larger leaf by brand or price (`fq=P:[a TO b]`, not tested).
- [V] Alternative: product sitemaps list `/<slug>-<productId>/p` URLs with `lastmod` (all showed 2026-10-13, so `lastmod` looks regenerated daily, not per product change [I]). They give product IDs only, no price or stock.
- [V] Payload weight: legacy search ~20-25 KB per product (50 products = 1,112,146 chars); Intelligent Search ~24 KB per product (100 products = 2.37 MB). [I] Full mirror is roughly 2-2.5 GB of JSON per full pass over ~109k products, ~2,200 requests at 50/page or ~1,100 at 100/page.
- [V] Legacy product object has 76 top-level keys incl. `allSpecifications`, `description`, `items[].images`; `commertialOffer` has 22 keys (Price, ListPrice, AvailableQuantity, IsAvailable, Teasers, PromotionTeasers, PriceValidUntil, Installments, PaymentOptions...).

### 3. Intelligent Search vs legacy search
- [V] `product_search/frutilla?count=8` (text in the path) returned the same non-matching list 3 times (Azúcar Azucel, Lomito de atún, Manteca, Banana, Puré de tomate). The same list is what `product_search` returns with no query. [I] The path segment is read as a facet, not text. The sibling note's `product_search/banana` example (first hit 579168 sugar) is therefore this default list, not a banana search.
- [V] `product_search?query=frutilla&count=8` x 3 (cache-busting `x=1,2,3`): identical order each time: 8326 Frutillas x kg., 314275 Frutillas en bandeja 250 g., 761724 Tic Tac Frutillas & Crema, 760423 Yogur batido Ser PRO, 765127 Yogur Griego Yogurísimo (only first 5 visible per run, page truncated).
- [V] `product_search?query=pan&count=8` x 3: identical first 5: 1760221 Parlante Panacom, 758013 Pan Integral Fargo, 753237 Pan blanco Bimbo, 563932 Pan de mesa Carrefour Classic, 731021 Pan rallado Preferido. Note the speaker ranks first, so relevance is loose.
- [V] Legacy `ft=frutilla&_from=0&_to=7` x 3: identical first 4 visible: 670215 Chicles Beldent, 742728 Obleas Bulnez, 684412 Mermelada Arcor, 612629 Sahumerios. Different from Intelligent Search order and less relevant (no fresh strawberries in the first 4).
- [?] Stability over hours or days not tested; the three runs were seconds apart. WebFetch caches 15 minutes per URL, so I added a dummy parameter to avoid cache hits; the dummy parameter may itself be passed to the server.
- [V] Intelligent Search returns `commertialOffer.teasers` with `name`, `conditions` (minimumQuantity, restrictions) and `effects` (e.g. PercentualDiscount). Example: product 760423 has the teaser "PROMO-2do al 70% Max 24 unidades Combinable SER-Reg-2-70-Aniv2 9 al 15.10", minimumQuantity 2, PercentualDiscount 35.
- [V] Legacy search returns `Teasers` and `PromotionTeasers` with the same names ("Tarjeta Carrefour 15%", "Tarjeta Carrefour 20% Off Martes") and `PriceValidUntil` (2027-10-13T17:33:06Z for the SKU checked), not a promotion date.
- [V] Intelligent Search product has 23 keys including `priceRange`, `skuSpecifications`, `productClusters`, `items`; response top-level keys: products, recordsFiltered, correction, fuzzy, operator, translated, pagination, options, searchId.

### 4. Cheaper refresh of price, stock and promos
- [V] Legacy `fq=skuId:35284&fq=skuId:18915&fq=skuId:22&_from=0&_to=9` returned 3 products (579168/18915 price 1479 qty 99999; 644286/35284 price 3799 qty 100; 649649/22 price 1639 qty 0, `GetInfoErrorMessage` withoutStock, IsAvailable false). Repeated `fq=skuId:` works as OR.
- [V] `fq=productId:644286,579168,8326` (comma form) returned only 1 product, so comma lists did not work as OR.
- [I] A refresh batch is bounded by the 50-item page window and the ~22 KB per product payload; there is no field filter in legacy search, so price-only refresh still downloads full products. Max number of `fq=skuId` terms per call (URL length) not tested.
- [V] VTEX "simulate a cart" guide: request has `items` (id, quantity, seller) and `country`; response has `price`, `listPrice`, `sellingPrice`, `priceDefinition`, `availability` ("available"), `priceTags`. The page states no item limit and does not mention `sc` or `regionId`.
- [?] Simulation item cap and rate limit: no VTEX page found stating them. A VTEX known issue says thousands of units of one SKU can time out ("The operation was canceled."), and staff say an orderForm holds at most 300 addresses (search snippet, not opened).
- [?] Simulation was not called (POST). It likely returns only price, availability and promo-adjusted selling price in a small payload [I], so it is the candidate for stock/price refresh; needs a live test with POST.
- [V] Sitemap `lastmod` is the same date for sampled entries (2026-10-13), so it cannot reveal which products changed.

### 5. Rate limiting
- [V] ~60 GETs in this run (including 1 MB to 2.4 MB responses) produced no 429 or throttling message; only HTTP 400 for out-of-range pagination.
- [?] Response headers (e.g. `Retry-After`, `x-vtex-*`) are not visible through WebFetch; Carrefour's actual limit is unknown.
- [V] VTEX Catalog API reference: "The default rate limit for the Catalog API is 45,000 requests per minute per account" and "15,000 requests per minute per endpoint". This is for the Catalog API; whether it applies to the public `catalog_system/pub` search on a storefront is not stated.
- [?] Rate limits of Intelligent Search and of simulation: not found.

### 6. Region dependence
- [V] Intelligent Search proxy URLs show `search/trade-policy/1` for anonymous requests, and legacy search returns seller `1` "CARREFOUR" as the default seller. So the anonymous default is trade policy (sc) 1 and seller 1.
- [V] `/api/checkout/pub/regions?country=ARG&postalCode=1425` returns a base64 `id` (starts "U1cjY2FycmVmb3Vy...") and 10 branch sellers (sibling note lists carrefourar0026, 0042, 0899...).
- [V] Intelligent Search `query=frutillas&count=2` without region: Frutillas x kg. (7999), Frutillas en bandeja 250 g. (2899); with `regionId=<id for 1425>`: Frutillas x kg. (7999), Tic Tac Frutillas & Crema (1049). The result set changed with `regionId`, with "Frutillas en bandeja" missing from the regional top 2. Both showed only seller 1, availableQuantity 10000.
- [I] Region changes which products/sellers are in the result (per-branch stock or assortment); price of a shared SKU was equal in the samples. Only 3 SKUs checked legacy-side (one displayed: 35284 price 3799 qty 100 with and without `regionId`). Broader price-by-region difference is unproven.
- [?] Whether other sales channels (`sc=2`, ...) exist and what prices they return was not tested.
- [?] Stock numbers like 99999 and 10000 look like placeholders for non-counted items (Banana, Frutillas); [I] they are not exact inventory.

### 7. Promotion churn
- [V] Teaser name seen on 2026-10-13: "PROMO-2do al 70% Max 24 unidades Combinable SER-Reg-2-70-Aniv2 9 al 15.10" (today is inside 9-15 October), so at least this promotion runs by calendar week.
- [V] Card teasers "Tarjeta Carrefour 15%" and "Tarjeta Carrefour 20% Off Martes" appear on essentially every product checked (no dates).
- [V] `productClusters` on products contain old promo cluster names, e.g. "AS 3 X 2 - 14 AL 19 MAYO", "AS FD 29 AL 03 -3x2 gaseosas cervezas leches", "AS 26.11 - 2 do al 50% ...", "LA DIETETICA MAYO". [I] Clusters are not removed after a promotion ends, so they cannot be used as the "active promotions" list; `teasers` are the active ones.
- [I] Weekly-range names suggest promotions rotate at least weekly, so promo data needs a refresh at least weekly; daily is safer. Frequency of price changes was not measured (needs two snapshots at different times).

## Unverified
- Exact product and SKU totals and exact leaf-category count: parse the full JSON (sitemaps, tree/4) with a script.
- Real limits and payload of `POST /api/checkout/pub/orderForms/simulation` (items per call, rate): live POST test, or VTEX support.
- Real 429 thresholds and headers: run requests with `curl -i` and inspect headers.
- Price and stock differences by `regionId`/`sc`/branch seller: compare many SKUs with and without `regionId`.
- Change frequency of price/stock/promos: take snapshots a few hours and days apart.
- Terms of use on automated access (see sibling note); robots.txt disallows `/busca/*` and `/*?_q` but not `/api/` (sibling note).

## Adjacent
- The sibling note's Intelligent Search example `product_search/banana` returned the default list, not banana; fix when reused.
- Legacy search with `ft=` ranks differently and less relevantly than Intelligent Search `query=`.
- Gift Cards (564) and "Test Category" (1) sit in the tree and would be mirrored if not excluded.

## Addendum 2026-10-13: catalog reduction and Carrefour's own classification (live curl)

- [V] `category/tree/4` parsed: 20 departments, 449 leaf categories. Electro y tecnología 66 leaves, Hogar 41, Almacén 41, Perfumería y farmacia 44.
- [V] Intelligent Search facets per `category-1/<slug>` (sum of category-2 counts): electro 23,754; hogar 20,557; juguetería 10,576; perfumería 8,055; desayuno 6,955; almacén 6,368; indumentaria 6,294; aire libre 5,174; bebidas 4,967; limpieza 3,502; lácteos 3,417; automotor 2,314; mundo bebé 1,822; panadería 1,336; congelados 1,271; frutas y verduras 1,025; mascotas 999; carnes 744.
- [V] `hideUnavailableItems=true` on `product_search/category-1/<slug>` cuts `recordsFiltered`: almacén 6,368 to 1,871. Available counts for the 10 grocery departments (almacén, bebidas, carnes, congelados, desayuno, frutas y verduras, lácteos, panadería, limpieza, perfumería): 1,871 + 1,506 + 226 + 315 + 2,171 + 214 + 1,043 + 261 + 1,282 + 2,217 = 11,106 products, against 37,640 listed in those departments and ~109k in the whole catalog.
- [V] Facet `tipo-de-producto` exists in every department; its values cover ~99% of products (e.g. almacén 6,333 of 6,368 with 653 distinct values; frutas y verduras 1,024 of 1,025 with 198 values).
- [V] Each product carries Carrefour's merchandise hierarchy as specifications: `EC_Sector`, `EC_Sección`, `EC_Grupo`, `EC_Familia`, `EC_Subfamilia`, plus `Tipo de producto` and `Descripción Genexis`. Examples: Frutillas x kg. = PRODUCTOS FRESCO / FRUTAS Y VERDURAS / FRUTAS / BERRIES / FRUTILLA, Tipo "Frutilla"; Shampoo Pantene 700 ml = P.G.C. / D.P.H. / CUIDADO DEL CABELLO / SHAMPOO / SHAMPOO HIDRATACION Y NUTRICION, Tipo "Shampoo".
- [V] Each product carries the legal unit price and size: `Precio x unidad` (e.g. "($2,664.14 x 100 ML.)"), `Gramaje de unidad de medida` (GRM, ML, UNI, KGM, M21), `Gramaje de unidad de consumo` (700.00) and `Gramaje factor de conversión`. Toilet paper is measured in square metres (M21, "x 1 M2."), not linear metres.
- [?] Whether `hideUnavailableItems` reflects seller 1 only or any seller, and whether the hierarchy and Gramaje fields are filled for every product, not measured beyond the samples above.

## Addendum 2026-10-13 (2): Tipo de producto vs Subfamilia over the grocery departments (live curl)

Figures recomputed from the full pass of Addendum 3 (`.data/carrefour/products.json`, fetched 2026-10-13T19:35Z, products of the 10 grocery departments). A first pass capped each leaf at 1,000 products and returned 37,216; three leaves hit the cap, so its figures were low and are replaced here.

Method: a product's unit is grouped as weight (GRM, GRS, KGM), volume (CM3, ML), unit (UNI) or other (M21, PAN, MTR); products without a unit are left out. Subfamilia groups are (Familia, Subfamilia) pairs, because the same Subfamilia name repeats under different Familias. Tipo + Subfamilia groups are (Tipo, Familia, Subfamilia). "Mismatch" is the share of products whose unit group differs from the majority of their group.

- [V] The grocery departments hold 37,673 unique products; 10,865 had stock for seller 1.
- [V] Field coverage: `Tipo de producto` 99.1%, `EC_Subfamilia` 97.2%, `Gramaje de unidad de medida` 97.2%. Units seen: GRM 18,911, CM3 11,098, UNI 4,385, GRS 1,801, KGM 197, M21 114, ML 65, PAN 46, MTR 11, none 1,045.
- [V] 2,203 distinct Tipo values in the grocery departments (2,131 among products with a unit).
- [V] Groups and mismatch: Familia 339 groups, 10.3%; Subfamilia 1,379 groups, 5.7%; Tipo de producto 2,131 groups, 5.4%; Tipo + Subfamilia 5,160 groups, 4.1%.
- [V] Subfamilia and Familia mix unrelated or misfiled products: Familias "OTRAS MARCAS" and "MARCA PROPIA" hold eggs and chicken cuts (brand ownership, not product kind); 3 "Huevos color" products sit in Subfamilia BLANCO; Subfamilia HUEVOS under CHOCOLATE PASCUAS holds 88 chocolate eggs; "Pan lactal" spans Subfamilias PAN DE MESA, LACTAL, INTEGRAL/MULTICEREAL and PAN DE SALVADO in two Familias.
- [V] Tipo de producto separates those cases ("Huevos blancos", "Huevos color", "Huevo de chocolate"; "Detergente" vs "Detergente para ropa"; "Frutilla" vs "Frutillas congeladas") and keeps variants as one value where Subfamilia splits them ("Yerba" across 7 Subfamilias, "Shampoo" across 23).
- [V] Some Tipos are catch-alls spread over many Familias: "Snacks" 15, "Cereal" 12, "Comida lista" 12, "Postre" 11, "Chocolate" 11, "Galletitas dulces" 11, "Vino tinto" 11.

## Addendum 2026-10-13 (3): full catalog pass (`scripts/carrefour-catalog.ts`, live)

- [V] Legacy search returns a `resources` header with the filter's total, e.g. `resources: 0-49/1655`. With no filter it reported 105,362 products on 2026-10-13, below Intelligent Search's 109,203.
- [V] A page can hold fewer products than requested while more remain: `fq=C:/605/607/&_from=150&_to=199` returned 49 of 1,655. Paging must stop on the header total, not on a short page.
- [V] Only one leaf category exceeds the 2,550-item window: `3/48/685` with 2,738. Inner categories above it are split into their children.
- [V] `fq=P:[a TO b]` filters by price (curl needs `-g` for the brackets), but 18,276 of the 23,775 products in Electro y tecnología have price 0 (no stock), so price ranges cannot split large categories.
- [V] `O=OrderByNameASC` plus `O=OrderByNameDESC` covered the 2,738-product leaf, but missed 1,371 of 4,966 in Bebidas; it is only used for leaves.
- [V] A few products sit directly in an inner category and in none of its children (e.g. Informática y gaming 7,105 against 7,098 in its children), so they are missed when that category is split.
- [V] Result: 105,336 unique products of 105,362, 15,180 with stock for seller 1, 5,486 distinct Tipo values, 1,648 products without a Tipo; 169 category requests, ~4.5 minutes at 8 concurrent requests, 74 MB of output.
