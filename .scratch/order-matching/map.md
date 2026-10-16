# Map: Match Items to catalog products with two LLM calls and a search

Label: wayfinder:map

## Destination

A ready-to-execute plan to replace the current order resolution with the flow in [design.md](design.md): an ADR that supersedes ADR 0003 and amends ADRs 0004 and 0005, and one spec at `.scratch/order-matching-build/spec.md` sliced into `ready-for-agent` build tickets. No production code changes inside this map.

## Notes

- Start every session from [design.md](design.md): the flow, the decisions already taken in conversation, both prompt drafts and the facts gathered.
- The new flow replaces the current one (`split-order`, `resolve-item`, `reword-item`, `map-answer`, Product Type questions); no side by side. Measure the current flow first so the new one has a baseline.
- Product Types, the Tipo mapping, the seed commands and their skills are deleted if the new flow does not use them.
- Products are searched in the Catalog Snapshot and simulated live in the Branch.
- The Payment Card and the preference are removed for now; the new flow has neither.
- Domain terms: Item, Match, Fit, Candidate (see `GLOSSARY.md`, updated on 2026-10-15).
- Conversations with the Owner in Spanish; every file in English.
- For grilling tickets use the `grilling` and `domain-modeling` skills; for search and module seams also `codebase-design`; prototypes with `prototype`, research with `research`.

## Decisions so far

- [Baseline of the current flow](issues/01-baseline-of-the-current-flow.md): 13/14 on the eval set (US$ 0.0200, 116 s), but 0/4 failing Items reach a cart; the eval set scores Product Types, not products, so ticket 08 must score the product.
- [Prototype the two calls](issues/02-prototype-the-two-calls.md): flow accepted; fixes the four failing Items, but call 2 takes 22–31 s and is unstable, search misses without `tipo`, and sizes must come from `consumptionQuantity`, not names.
- [Search for Matches](issues/03-search-for-matches.md): `CatalogSearch.findMatches(item, limit)` over `name`, `brand` and `tipo`; BM25 and `pg_trgm`-style word similarity fused by RRF; brandless search always runs; in-stock only, non-grocery departments excluded; no Tipo mapping.
- [Size and quantity in code](issues/04-size-and-quantity-in-code.md): the Sale Step (`unitMultiplier`) joins the Catalog Snapshot; sizes only from `measureUnit` and `consumptionQuantity`; most common size is the mode among packaged Fits; weights rounded to the nearest Sale Step and compared across sold-by-weight and packaged Fits by total price; every change the Owner did not ask for gets a note.
- [Questions and answers in the new flow](issues/05-questions-and-answers.md): an answer reruns call 1 for the asked Items only (choice, new lines, drop or unanswered); no cart while a question is open; each question shows up to 5 Alternatives from call 2; at most 2 questions per Item, then dropped with a note; unanswered questions are re-asked by code.
- [Payment Card and preference](issues/06-payment-card-and-preference.md): both removed for now, in code before the build; the Selection Policy is one fixed rule (savings first, then price per unit of measure); up to 10 Candidates per Item; call 1 flags an ignored card or preference with a note.
- [Fate of Product Types and the seed](issues/07-fate-of-product-types-and-the-seed.md): all deleted, no Tipo mapping; the seed (and `tipos.json` of `carrefour:catalog`) goes in the first build slice, the vocabulary in the last with the old flow; the new ADR also supersedes ADR 0001; glossary terms leave with the code.
- [New eval set](issues/08-new-eval-set.md): `evals/order-matching.json` replaces the current set; each Item lists acceptable `productId`s (`fits`, optional `pick`, `alternatives`); runs up to the pick on Snapshot prices, 3 runs per case; headline metric is wrong picks nobody sees; answer cases test call 1 alone; stale ids reported, not failed.
- [Latency of call 2](issues/10-latency-of-call-2.md): target 15 s to the cart for about 10 Items with one progress step per Item; Haiku stays; one call 2 per Item in parallel only if measured to halve the time without losing Fits; levers chosen by measurement.
- [Corrections to resolved Items](issues/11-corrections-to-resolved-items.md): the conversation stays open after the cart; one follow-up call 1 reads answers and Corrections, finding the Item by number; a corrected Item reruns the flow with 2 new questions; untouched Items keep their product and the whole cart is simulated again; the new cart shows every line, marking the changed ones.
- [Measure the levers of call 2 latency](issues/12-measure-the-levers-of-call-2-latency.md): the time is Haiku's thinking, not the input; call 2 runs once per Item, up to 10 at a time, on Sonnet, 30 Matches, with an `<also-in-this-line>` tag for split lines: about 7 s and the most stable Fits; call 1 (7 to 8 s) now decides the 15 s target.
- [Does the cart link add to an open cart](issues/13-does-the-cart-link-add-to-an-open-cart.md): logged out a cart link replaces the cart; logged in it adds lines and sets quantities but never removes one, so every cart message warns to empty the Carrefour cart first.
- [Latency of call 1](issues/14-latency-of-call-1.md): call 1 runs on Sonnet with `--effort low` and writes `size` and `quantity` as short strings: about 5.5 s for 10 Items with no drift; target 6 s on average, 7 s at worst; a turn is about 13 to 14 s.
- [Notes to the Owner](issues/15-notes-to-the-owner.md): Notes sit under their cart line (call 2 first, then code templates in flow order) or in a block after the table (Items not got, Items removed, ignored card or preference); no Note for defaults; a fixed warning to empty the Carrefour cart before the link; later carts mark lines "Nuevo" or "Cambiado" and a Note shows in the first cart that holds its Item.
- [Write the ADR, spec and build tickets](issues/09-write-the-adr-spec-and-build-tickets.md): ADR 0012 supersedes 0001 and 0003 and amends 0004, 0005 and 0006; the spec `.scratch/order-matching-build/spec.md` has eleven `ready-for-agent` tickets, from deleting the seed, through the new flow built beside the old one, the eval set, the chat switch-over, questions and Corrections, to deleting the old flow.

## Not yet specified

## Out of scope

- Moving the search and data to Supabase (Postgres, `pg_trgm`, full text search). The search sits behind an interface so it can move later as its own effort.
- Embeddings or any semantic search: reopen only if the eval set shows misses on synonyms.
