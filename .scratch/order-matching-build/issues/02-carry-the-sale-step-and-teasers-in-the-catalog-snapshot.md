# 02: Carry the Sale Step and teasers in the Catalog Snapshot

**What to build:** `pnpm carrefour:catalog` keeps, for each product, `measurementUnit` and `unitMultiplier` of its first item and its promotion teasers, and the Catalog Snapshot loader turns each record into a catalog product the new flow can read: whether it is sold by weight and its Sale Step, its size from `measureUnit` and `consumptionQuantity` only, its price, stock, department, `tipo` and teasers. See the spec, "Catalog Snapshot".

**Blocked by:** None (can start immediately)

**Status:** resolved

## Decisions (agreed with the Owner)

- Same endpoint (`catalog_system/pub/products/search`), no extra requests. Teasers come from `PromotionTeasers` (`Name`, `Conditions.MinimumQuantity`).
- Sold by weight when `measurementUnit` is `kg`; Sale Step is `unitMultiplier` in kg; such a product has no size.
- Packaged size only from `measureUnit` and `consumptionQuantity`, normalized to ml, g, units or metres; no size read from names. A product without them has no size.
- Products without `tipo` are kept: the search reads `name` and `brand` too.
- The loader requires the new fields; an older `products.json` fails with a message telling to run `pnpm carrefour:catalog` again.

## Constraints

- The current flow keeps working: whatever it reads from the snapshot (`snapshotProducts`, grocery products by mapped Tipo) behaves as before, now fed from the new record.
- The size normalization is new code for the new flow; it does not reuse `sizesIn` (names), which ticket 11 deletes.

## Acceptance

- [x] Download tests with a recorded fixture cover `measurementUnit`, `unitMultiplier` and teasers.
- [x] Loader tests: a product sold by weight (banana `kg 0.5`), a packaged one (`CM3 1500` is 1.5 l), one without size, one without `tipo`, and an old record failing with the re-download message.
- [x] `pnpm carrefour:catalog` run once for real; the counts of products sold by weight and with teasers noted under Comments.
- [x] `docs/references/carrefour-api.md` records that the catalog endpoint carries the Sale Step and teasers; `ARCHITECTURE.md` Data table updated.
- [x] `pnpm check` exits 0.

## Comments

- Built: `src/adapters/carrefour/catalog-download.ts` keeps `measurementUnit`, `unitMultiplier` and `teasers` (from `PromotionTeasers`, `Name` and `Conditions.MinimumQuantity`) and counts `productsSoldByWeight` and `productsWithTeasers` in the meta. `src/core/order-matching/catalog-product.ts` holds the `CatalogProduct` of the new flow (`sale` is `{ kind: "by-weight", saleStepKg }` or `{ kind: "packaged", size }`, plus price, `inStock`, department, `tipo`, teasers) and `packageSize`, which normalizes `measureUnit` and `consumptionQuantity` to ml (`ML`, `ML1`, `MIL`, `CM3`, `LTR`), g (`GRM`, `GRS`, `GR1`, `KGM`), units (`UNI`, `UN1`) or metres (`MTR`); `M21`, `PAN`, `LM1` and anything else give no size, since their amounts do not read as a size (`M21` `18` for "30 mts x 6", `LM1` `440` for "440 cc"). `loadCatalogProducts` in `src/adapters/files/data-files.ts` (exported by `compose`) turns each record into one; `loadCatalog` now fails with "Run pnpm carrefour:catalog again." on a record without the new fields instead of throwing.
- A teaser without `Conditions.MinimumQuantity` is dropped by the download; how many there are was not measured.
- Recorded fixture: `src/adapters/carrefour/fixtures/catalog-search-coca-cola-banana.json`, live answer of 2026-10-15 trimmed to the fields read.
- `pnpm carrefour:catalog` run on 2026-10-15 (`fetchedAt` 2026-10-15T20:44:49Z): 105,525 unique products, 15,857 with stock, 1,648 without `tipo`. Sold by weight: 1,797 (454 with stock). With teasers: 21,501 (1,952 with stock). Packaged with a size: 63,933; packaged without a size: 39,795. Sale Steps seen: 0.5 kg on 564 products, 1 kg on 274, 0.1 kg on 236, 0.3 kg on 150, 0.2 kg on 128, others below 100 each. Banana selección x kg. (719074) loads as sold by weight with a 0.5 kg step; Coca Cola 2,25 lts (30138) as packaged 2,250 ml with its "2do al 50%" teaser, minimum quantity 2. Loading the 105,525 catalog products took 242 ms.
- The current flow loads the new snapshot through `loadOrderData`: 37,734 grocery products, 37,413 snapshot products.
