# 02: Carry the Sale Step and teasers in the Catalog Snapshot

**What to build:** `pnpm carrefour:catalog` keeps, for each product, `measurementUnit` and `unitMultiplier` of its first item and its promotion teasers, and the Catalog Snapshot loader turns each record into a catalog product the new flow can read: whether it is sold by weight and its Sale Step, its size from `measureUnit` and `consumptionQuantity` only, its price, stock, department, `tipo` and teasers. See the spec, "Catalog Snapshot".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

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

- [ ] Download tests with a recorded fixture cover `measurementUnit`, `unitMultiplier` and teasers.
- [ ] Loader tests: a product sold by weight (banana `kg 0.5`), a packaged one (`CM3 1500` is 1.5 l), one without size, one without `tipo`, and an old record failing with the re-download message.
- [ ] `pnpm carrefour:catalog` run once for real; the counts of products sold by weight and with teasers noted under Comments.
- [ ] `docs/references/carrefour-api.md` records that the catalog endpoint carries the Sale Step and teasers; `ARCHITECTURE.md` Data table updated.
- [ ] `pnpm check` exits 0.

## Comments
