# 03: Search the Catalog Snapshot for Matches

**What to build:** The `CatalogSearch` port in `src/core/order-matching/` and its in-memory adapter in `src/adapters/catalog-search/`, wired in `src/compose.ts` from the Catalog Snapshot of ticket 02. `findMatches({ product, brand }, limit)` returns the Matches of one Item. Not yet called by the chat. See the spec, "Search".

**Blocked by:** 02

**Status:** resolved

## Decisions (agreed with the Owner)

- Indexed: `name`, `brand`, `tipo`. Excluded before indexing: no stock, and the departments Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería, Aire Libre y Ocio.
- Queries: `product`; with a brand, also `product + brand`. Brand never filters.
- Rankings: BM25 (`bm25.ts` moves into the adapter; the old flow imports it from there until ticket 11) and trigram word similarity as `pg_trgm` `word_similarity`. Fused by RRF, k = 60; ties by catalog order. `limit` 30 by default.
- The port is synchronous and takes one Item per call; query building, filters, rankings and fusion all live behind it.
- ADR 0012 records the port; `ARCHITECTURE.md` lists it beside `Llm` and `OnlineStore`.

## Constraints

- Tests use the real adapter over a small fixture snapshot, no fake.
- Index build and one search for 10 Items each stay under 1 s on the full snapshot; measured once and noted under Comments.

## Acceptance

- [x] Tests: "porsalud" finds Port Salut; "Carbón para asado" finds "Carbón de leña 4 kg." through `tipo`; "Picaña" ranks "Tapa de cuadril (picanha)" above "picante" products; "provoleta" with brand "Santa Julia" still returns provoletas; out-of-stock and excluded-department products never come back; equal scores keep catalog order.
- [x] The four failing Items of the 2026-10-15 Conversation Log, run against the real snapshot, have their expected products among their 30 Matches; result noted under Comments.
- [x] `ARCHITECTURE.md` names `src/adapters/catalog-search/` and the `CatalogSearch` port.
- [x] `pnpm check` exits 0.

## Comments

### Built (2026-10-15)

- Port `CatalogSearch` in `src/core/order-matching/catalog-search.ts` (`findMatches(item, limit = MATCHES_LIMIT)`, `MATCHES_LIMIT` 30). Adapter `createInMemoryCatalogSearch` in `src/adapters/catalog-search/in-memory-catalog-search.ts`, with `bm25.ts` (moved from `src/core/order-resolution/`, now also exposing `scores`) and `word-similarity.ts`. `createCatalogSearch()` in `src/compose.ts` builds it from `loadCatalogProducts`.
- Word similarity: each word padded as in `pg_trgm` (`"  w "`), Jaccard of trigram sets per word, the best document word per query word, averaged over the query words. Each ranking gives tied scores the same rank (competition ranking) before RRF, so equal scores fuse equal and fall back to catalog order.
- `resolve-order.ts` imports `bm25.ts` from the adapter with an `eslint-disable-next-line no-restricted-imports` until ticket 11 deletes it; `ARCHITECTURE.md` names the exception.
- ADR 0012 already recorded the port (it amends ADR 0006); no new ADR.

### Picaña and picante (decided by the coordinator, option A)

With `pg_trgm` semantics "picana" scores 5/10 against both "picanha" and "picante" (true `pg_trgm` `word_similarity` also ties, at 5/7), and BM25 matches neither, so "Tapa de cuadril (picanha)" vs "picante" products falls to catalog order. Kept the `pg_trgm` semantics for parity with a later Postgres adapter. The fixture test ranks the snapshot's current name, "Picaña de cerdo Etiqueta Negra x kg" (Tipo "Picanha"), first above every "picante" product, and only asserts that "Tapa de cuadril (picanha)" is among the Matches.

### Carbón and `tipo`

On the real snapshot `tipo` does not help "Carbón para asado" reach "Carbón de leña 4 kg.": it ranks 22nd with `tipo` indexed and 14th with every `tipo` removed, because Tipos such as "Asado" lift meat. It is still among the 30 Matches, with the three other carbones (Carbón vegetal Carbocor 16th, Carbon vegetal asados 2nd, Briquetas de carbón 25th). The fixture tests check it is found, and separately that a product is found through its `tipo` alone.

### The four failing Items on the real snapshot

Catalog Snapshot of the petrel worktree, `.data/carrefour/products.json` (fetched 2026-10-15, 105,525 products, 13,689 indexed after the stock and department filters). Items as call 1 writes them in the `parse-order` draft:

- "Queso Port Salut light", no brand: the 6 in-stock Port Salut light products at ranks 1 to 6. Misspelt "Queso porsalud light": 5 of the 6 within the 30 (ranks 3, 9, 17, 18, 20); with "Porsalud" as brand of "Queso light": 5 of the 6 (ranks 12, 13, 20, 24, 27).
- "Gaseosa cola zero", brand "Coca Cola": every Coca-Cola Zero at ranks 1 to 5 (600 ml, 2,25 l, 1,75 l, 1,25 l, 354 ml), the biggest (2,25 l) among them.
- "Gaseosa cola sabor original", brand "Coca Cola": every Coca-Cola sabor original at ranks 1 to 6, the smallest (220 ml) first.
- "Carbón para asado", no brand: the 4 in-stock carbones, ranks 2, 16, 22 and 25.

### Timing

Same snapshot, `tsx` on this machine, JSON load not counted: index build 75 to 82 ms; one search of the 10 Items of the prototype's log order 90 to 93 ms, and of its unseen order 62 ms (3 runs each). Well under 1 s.
