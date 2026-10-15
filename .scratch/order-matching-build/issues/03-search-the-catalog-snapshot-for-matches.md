# 03: Search the Catalog Snapshot for Matches

**What to build:** The `CatalogSearch` port in `src/core/order-matching/` and its in-memory adapter in `src/adapters/catalog-search/`, wired in `src/compose.ts` from the Catalog Snapshot of ticket 02. `findMatches({ product, brand }, limit)` returns the Matches of one Item. Not yet called by the chat. See the spec, "Search".

**Blocked by:** 02

**Status:** ready-for-agent

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

- [ ] Tests: "porsalud" finds Port Salut; "Carbón para asado" finds "Carbón de leña 4 kg." through `tipo`; "Picaña" ranks "Tapa de cuadril (picanha)" above "picante" products; "provoleta" with brand "Santa Julia" still returns provoletas; out-of-stock and excluded-department products never come back; equal scores keep catalog order.
- [ ] The four failing Items of the 2026-10-15 Conversation Log, run against the real snapshot, have their expected products among their 30 Matches; result noted under Comments.
- [ ] `ARCHITECTURE.md` names `src/adapters/catalog-search/` and the `CatalogSearch` port.
- [ ] `pnpm check` exits 0.

## Comments
