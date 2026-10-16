# 03: Search for Matches

Type: grilling
Status: resolved
Blocked by: 02

## Question

How does code find the Matches of an Item: which fields are indexed (name, brand, Tipo, category), how the query is built from `product` and `brand`, how many Matches per Item, how BM25 and trigrams are fused, whether it retries without the brand when few Matches come back, whether products out of stock or outside groceries are left out, and what interface hides it so it can move to Supabase later?

## Comments

- From [Prototype the two calls](02-prototype-the-two-calls.md): with name and brand only, "Carbón de leña 4 kg" never entered the 30 Matches and "Picaña" brought mostly "picante" products (the real one ranked 17th); trigrams bring that noise. Indexing the product `tipo` would have found both. Call 1 may still write a misspelt brand ("Porsalud") into the query.

## Answer

Agreed with the Owner on 2026-10-15.

- **Fields indexed**: `name`, `brand` and `tipo`. `tipo` finds what names miss ("Carbón de leña 4 kg." has `tipo` "Carbón de leña"; "Tapa de cuadril (picanha)" has `tipo` "Picanha"). The `category` path is left out: its generic words ("Almacén", "Hogar") add BM25 noise.
- **Query**: without a brand, one search for `product`. With a brand, two searches, `product` alone and `product + brand`, fused by RRF. The brand is never a hard filter: a missing brand ("provoleta Santa Julia") or a misspelt one ("Porsalud") must not empty or bury the Matches. This replaces a retry without the brand: the brandless search always runs.
- **Trigrams**: word similarity as in `pg_trgm` `word_similarity` (for each query word, its best similarity to a document word, averaged), not the share of query trigrams over the whole text, which brought "picante" for "Picaña". It keeps typo tolerance and gives the later Supabase adapter the same semantics to compare against.
- **Fusion**: BM25 and trigram rankings fused by RRF, k = 60, ties broken by catalog order so results are stable.
- **Excluded before searching**: products without stock in the Catalog Snapshot (`availableQuantity` 0) and a fixed list of excluded departments: Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería, Aire Libre y Ocio. A list of exclusions, so a new department is searched by default; Hogar, Perfumería y farmacia, Mascotas and Mundo Bebé stay in (lavandina, pañales). The search does not use the Tipo mapping to Product Types, so [Fate of Product Types and the seed](07-fate-of-product-types-and-the-seed.md) can delete it freely. Stock in the snapshot is a first cut; the simulation in the Branch has the last word.
- **Matches per Item**: a `limit` parameter, 30 by default as in the prototype. [Latency of call 2](10-latency-of-call-2.md) tunes it; [New eval set](08-new-eval-set.md) measures recall at that cut.
- **Interface**: a port `CatalogSearch` with `findMatches(item: { product, brand }, limit): Product[]`, one Item per call. Query building, filters, both rankings and the fusion live behind it, so a Supabase adapter can build its own `tsquery` and `pg_trgm` query. The in-memory adapter is built from the Catalog Snapshot through the loaders of `src/compose.ts`; tests run it over a fixture snapshot, no fake. One adapter today: the seam is kept because the map plans to move the search to Supabase.
- **Glossary**: Match now reads "found … because its name, brand or Carrefour type resembles what the Owner asked for".

