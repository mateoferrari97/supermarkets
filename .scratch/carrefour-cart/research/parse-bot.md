# What is parse.bot and what can it do for carrefour.com.ar

Consulted 2026-10-13. Marks: **[V]** verified in the cited page or file, **[I]** my inference, **[?]** not verified.

Primary sources:
- Parse docs home: https://docs.parse.bot/
- Docs index: https://docs.parse.bot/llms.txt
- Marketplace doc: https://docs.parse.bot/marketplace
- Marketplace search reference: https://docs.parse.bot/api-reference/marketplace/search-and-browse-the-marketplace.md
- Authenticated APIs: https://docs.parse.bot/authenticated-apis
- Pricing: https://www.parse.bot/pricing
- Terms: https://www.parse.bot/terms
- Marketplace listing (live API): https://api.parse.bot/marketplace/apis?q=carrefour.com.ar&limit=3
- Carrefour AR catalog endpoint: https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft=banana&_from=0&_to=1

## Answer
Parse is a scraper-to-API generator: you give a URL and a description, it builds and hosts an HTTP API for the site, and it also has a public marketplace of prebuilt APIs. A prebuilt "carrefour.com.ar API" exists, read-only, with 3 GET endpoints (offers of the day, cellphones, keyword search) at 1 credit per call. Response fields were not documented in anything I could read. Carrefour AR's own site exposes a VTEX catalog endpoint with name, ids, price, stock, link and add-to-cart URL, which already covers more than the Parse listing shows.

## Findings
- [V] Product: "Parse turns any website into a structured API you can call over plain HTTP." Build in the dashboard or via `POST /dispatch`; or use marketplace prebuilt APIs. Parse hosts the APIs and handles proxies and anti-bot. (https://docs.parse.bot/)
- [V] Calling: `POST https://api.parse.bot/scraper/{scraper_id}/{endpoint_name}`; GET endpoints take query params. Auth is header `X-API-Key` (keys start `pmx_`); the marketplace listing is public without a key. (https://docs.parse.bot/, https://docs.parse.bot/api-reference/marketplace/search-and-browse-the-marketplace.md)
- [V] A marketplace API exists: "carrefour.com.ar API", slug `carrefour-com-ar-api`, source_url https://carrefour.com.ar, `is_authenticated: false`, 3 endpoints, all GET, price 1 credit each, updated_at 2026-09-23. Endpoints: `get_offers_of_the_day` ("top-selling products across all categories"), `list_cellphones` (specs and promotions, `page`/`limit`), `search_products` (keyword, relevance order). (https://api.parse.bot/marketplace/apis?q=carrefour.com.ar&limit=3)
- [?] Response fields (name, SKU, price, availability, URL, region/store) and parameters beyond pagination/keyword: not shown in the listing. The detail URL `https://api.parse.bot/marketplace/apis/carrefour-com-ar-api` returned HTTP 400. No region/store parameter is visible.
- [V] Using an existing marketplace API is "instantly and for free" to obtain; the page does not state per-call billing for it, but the listing shows price 1 per endpoint. Canonical calls always run the latest version and cannot be pinned; subscribing pins a copy. (https://docs.parse.bot/marketplace)
- [V] Mutations: endpoints can "act" (log in, submit forms, multi-step flows) per the docs home. The authenticated-APIs page documents no add-to-cart example (only a read `get_inbox`), but warns about accounts that can "place orders". The Carrefour AR listing is `is_authenticated: false` with read-only GETs, so it has no cart or login endpoint. (https://docs.parse.bot/, https://docs.parse.bot/authenticated-apis)
- [V] Authenticated APIs: not on Free plan; 5 sessions per site on paid, 10 on higher plans; logins capped at 3 attempts/hour per site per account; each login returns `session_id` and `encryption_key` (Parse does not store the key). (https://docs.parse.bot/authenticated-apis)
- [V] Pricing: Free $0 200 credits 5 req/min; Hobby $30/mo 1,000 credits 20 req/min; Developer $100/mo 5,000 credits 100 req/min; Team $300/mo; Company $1,000/mo; Enterprise custom. Building a private API costs 75 credits (50 per revision). Per-call cost varies by API. (https://www.parse.bot/pricing)
- [?] Freshness: not stated. Each call runs against the live site per the docs wording ("calls"), but no caching or staleness policy was found. Docs only state subscribed copies are pinned to a release (https://docs.parse.bot/llms.txt).
- [V] Terms: user must not violate third-party terms or circumvent technical measures; "you are solely responsible" for compliance with third-party terms; Parse acts as the user's agent when using credentials. (https://www.parse.bot/terms)
- [V] Carrefour AR runs a VTEX public catalog endpoint: `/api/catalog_system/pub/products/search?ft=banana` returned JSON with `productId` (e.g. 644286), `itemId` SKU (35284), `productName`, price 3799.0 and ListPrice, `IsAvailable`/`AvailableQuantity` 100, seller CARREFOUR, `link`, `linkText`, and `sellers[].addToCartLink`; currency not stated in the JSON. (URL above; fetched via a summarising model, so field names are as reported by it)
- [I] Versus calling that endpoint directly: Parse adds anti-bot/proxy handling and no code, but adds cost, a third-party dependency, an unverified field set and no visible region/store parameter. The direct VTEX endpoint exposed richer fields in one fetch. Whether it blocks automated or server-side traffic was not tested.

## Unverified
- Response schema and params of the three Carrefour AR endpoints (needs an API key call, or the detail response of the marketplace API, or `https://docs.parse.bot/openapi.json` for the scraper).
- Whether Parse can build a custom cart/login API for carrefour.com.ar (needs a build; costs 75 credits and login requires a paid plan).
- Data freshness and caching; Parse behaviour on the free plan's rate limit.
- Whether the VTEX endpoint works from server-side/cloud IPs, and VTEX cart-mutation endpoints (not tested).

## Adjacent
- The marketplace listing's `front_facing_description` mentions "news articles" and financial data about Carrefour, which does not match the 3 endpoints, so that description looks unreliable.
