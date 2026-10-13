# How can a program build a Carrefour AR cart so a human only opens a link and pays?

Consulted 2026-10-13. Marks: **[V]** verified in the cited page or file, **[I]** my inference, **[?]** not verified.

Primary sources:
- Carrefour AR robots.txt: https://www.carrefour.com.ar/robots.txt
- Carrefour AR homepage: https://www.carrefour.com.ar/
- Carrefour AR catalog API (live GET): https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft=banana&_from=0&_to=2
- Carrefour AR intelligent search (live GET): https://www.carrefour.com.ar/api/io/_v/api/intelligent-search/product_search/banana?count=2
- Carrefour AR regions (live GET): https://www.carrefour.com.ar/api/checkout/pub/regions?country=ARG&postalCode=1425 (and postalCode=5000)
- VTEX cart URL tutorial: https://help.vtex.com/api/llm-content?section=tutorials&locale=en&slug=how-to-assemble-the-cart-url
- VTEX headless cart and checkout: https://developers.vtex.com/docs/guides/headless-cart-and-checkout
- VTEX get cart by ID: https://developers.vtex.com/docs/guides/get-cart-information-by-id

Tooling limit: no Bash/curl in this run; live endpoints were fetched with WebFetch (no cookies, no mutation).

## Answer
carrefour.com.ar runs on VTEX. The public catalog and regions endpoints respond without login, so a program can find SKUs, prices and stock. The official VTEX add-to-cart URL (`/checkout/cart/add?sc=..&sku=..&qty=..&seller=..`) can carry many SKUs in one link, but VTEX docs do not say whether the cart follows the person who opens the link; the docs tie the cart to browser cookies. A server-side orderForm shared by `orderFormId` link is not documented by VTEX. Cart-link behaviour on Carrefour (sc value, seller per branch) is untested.

## Findings
- [V] Platform is VTEX: homepage assets are served from `carrefourar.vtexassets.com/assets/vtex.file-manager-graphql/...` (https://www.carrefour.com.ar/).
- [V] Legacy catalog API responds with JSON: products with productId (e.g. "644286"), items[0].itemId ("35284"), seller `"1"`/"CARREFOUR", Price 3799.0, AvailableQuantity 100 (catalog search URL above).
- [V] Intelligent Search responds with JSON `products` array; first hit productId 579168, itemId 18915, sellerId "1" "CARREFOUR", price 1479 (URL above).
- [V] VTEX cart URL format: append `/checkout/cart/add?` and use `sc`, `sku`, `qty`, `seller`; "The other three parameters (SKU, Quantity and Seller) must be repeated every time a new product is added"; sc "only necessary ... once". Example from search result: `...cart/add?sc=1&sku=22&qty=1&seller=1&sku=73&qty=3&seller=1` (VTEX tutorial). The tutorial "does not address" redirect, cookies or cart ownership.
- [V] VTEX headless guide: browser carts are managed by VTEX cookies (`checkout.vtex.com` holds orderFormId); non-browser storefronts must save the orderFormId; a `CheckoutOrderFormOwnership` cookie "ensures that only the customer who created the cart has unrestricted access to their personal information"; without it "the returned order form will have masked personal data" (headless guide).
- [V] Cart is readable by ID: `GET /api/checkout/pub/orderForm/{orderFormId}`; the ID should come from the get-or-create endpoint, not JS cookie reads (get-cart-by-id guide).
- [?] No VTEX page found documenting a `/checkout?orderFormId=...` link that loads a server-created cart in another person's browser. Search returned none; absence is not proof it fails.
- [I] Because the documented cart lives in cookies, `/checkout/cart/add` opened by the human most likely builds the cart in the human's own browser session (a new cart per opener), which is what "open a link and pay" needs. Needs a live test.
- [V] Regional: `/api/checkout/pub/regions?country=ARG&postalCode=1425` returns a region_id and a list of branch sellers (e.g. carrefourar0026 "Hiper Warnes", carrefourar0042 "Hiper Merlo", carrefourar0899 "Hogar & Electro"); postalCode=5000 returns a different set (e.g. carrefourar0009 "Hiper Córdoba Colón").
- [I] Branch sellers differ by postal code, so availability/price and the `seller` value in the cart link probably depend on the location the shopper has set; default seller "1" appears in catalog results without a postal code. Unknown whether the cart link works with seller=1 or needs a branch seller, and which `sc` Carrefour uses.
- [V] robots.txt (`User-agent: *`) disallows: `/img/*`, `/account/*`, `/login/*`, `/checkout/*`, `/busca/*`, `/quick-view/*`, `/espiar/*`, `/buscapagina/*`, `/*?_q`, `/folletos-new/`. It does not disallow `/api/`. Sitemap: https://www.carrefour.com.ar/sitemap.xml
- [I] `/checkout/*` is disallowed for crawlers; a link handed to a human is not crawling, but automated GETs to `/checkout/cart/add` would hit a disallowed path.
- [?] Terms and Conditions: https://www.carrefour.com.ar/terminos-y-condiciones and /legales returned truncated text with no scraping/automation clause visible. A search snippet says: operator INC S.A.; site "solo para personas humanas mayores de 18 años"; sale perfected only after INC S.A. validates stock, payment and data. No automated-access clause confirmed either way.
- [?] Alternatives: search found only that Carrefour tried a quick-delivery app (Bringo, ~2022, per iProUP) and no confirmation of WhatsApp ordering or an official Rappi/PedidosYa Carrefour listing in AR today (not verified against primary sources).

## Unverified
- Real cart link behaviour on carrefour.com.ar (cookie-bound cart, valid `sc`, seller 1 vs branch seller, postal-code prompt): test by opening `https://www.carrefour.com.ar/checkout/cart/add?sc=<n>&sku=35284&qty=1&seller=1` in a browser.
- Valid `sc`: look in page `__RUNTIME__`/orderForm `salesChannel` field.
- Full T&C text (clauses on automated access): read the page in a browser.
- Whether VTEX supports an orderFormId handoff link: VTEX support/docs.
- WhatsApp/app/Rappi/PedidosYa channels: Carrefour AR and those apps' own pages.

## Adjacent
- Region list suggests stock is per branch seller; a SKU may be unavailable in the shopper's branch even if the catalog shows it.
