---
Status: accepted
---

# Match Items to catalog products with two LLM calls around a search

ADR 0003 resolved each Item to Product Types: the LLM wrote a brand and terms without seeing the catalog, and code then needed those exact words in product names. In the Conversation Log of 2026-10-15 that failed four Items of one order: "1 bolsa de carbon" asked about the word "bolsa" in a loop, "porsalud" became a brand that does not exist, "grande" became a size question with 354 ml among the options, and "normal" was lost so a Zero could be bought. The eval set passed 13 of 14 cases because it never scored the product.

An order is now matched in four steps, and no Product Type is involved:

1. **Call 1** reads the order into Items: the Owner's words (`original`), a supermarket product name with its variant and the spelling fixed (`product`), the brand as written or none, a `size` (`common`, `biggest`, `smallest` or an exact amount) and a `quantity` (`minimum`, units or a weight), written as short strings that code parses. It also flags a card or a preference the Owner wrote, which is ignored (ADR 0011).
2. **Code searches the Catalog Snapshot** for each Item: BM25 on words and a word similarity on character trigrams (as `pg_trgm`'s `word_similarity`), over each product's name, brand and Carrefour `tipo`, fused by rank (RRF, k = 60), without and with the brand, so a missing or misspelt brand never empties the result. Products without stock in the snapshot and a fixed list of non-grocery departments are left out. The 30 best are the Item's Matches.
3. **Call 2**, once per Item and up to 10 at a time, reads the Item and its Matches and keeps every Match that fits (the Fits), never a favourite. It writes a Note when the brand named is missing or a word was read differently. When nothing fits it asks the Owner one question and offers up to 5 Alternatives. An Item split from the same words as another sees the other's product, so "1 y 1 chorizo morcilla" keeps chorizos and morcillas apart.
4. **Code picks**: a size rule over the Fits (sizes only from `measureUnit` and `consumptionQuantity`, never from names; the most common size by default; "grande" and "chica" as the biggest and smallest packaged size), quantities rounded to Carrefour's Sale Step for products sold by weight, and weights met by packaged and sold-by-weight Fits compared by total price. Up to 10 Candidates per Item, the cheapest per unit of measure by snapshot price, are simulated alone in the Owner's Branch, and the fixed Selection Policy of ADR 0011 picks one. The whole cart is simulated once more before it is shown.

Both calls run on Claude Sonnet 5.5: call 1 with low effort (about 5.5 s for 10 Items), call 2 at its default effort (about 7 s for 10 Items in parallel). Haiku 5.5 was faster on call 2 only with low effort, and then it broke prompt rules and gave less stable Fits; on call 1 it took a variety for a brand and rewrote brands. The target is the cart or the questions within 15 s of the Owner's message for about 10 Items, checkout simulation not counted.

The LLM still translates and code still decides: no price, size or quantity is chosen by the LLM, and the products it may keep or offer are only numbers among the Matches code gave it.

This supersedes ADR 0001 and ADR 0003. Product Types, Product Type Groups, the Carrefour Tipo mapping and the seed that built them are deleted.

It amends ADR 0004:

- Doubts are asked only when no Match fits an Item. A brand the Catalog Snapshot lacks, a size that does not exist or a vague word is not asked: code picks and says so in a Note.
- An Item is asked at most twice, then dropped with a Note. An answer the Owner leaves unclear is asked again by code with the same text and Alternatives.
- The Owner's reply, whether it answers questions or corrects an Item already in the cart, is read by call 1 in follow-up mode, which sees every Item by number and returns an entry only for the Items the reply touches. Mapping an answer onto options (`map-answer`) is gone.
- The conversation stays open after the cart: a Correction reruns only the corrected Items and yields a new cart that replaces the previous one. Nothing is still kept between conversations.

It amends ADR 0005: products are no longer listed by Carrefour's live search. The Candidates come from the Fits found in the Catalog Snapshot, and the Branch has the last word through checkout simulation, as before. Live search is no longer called.

It amends ADR 0006: the search is a third port, `CatalogSearch`, with one in-memory adapter built from the Catalog Snapshot. It is a port because the search is planned to move to Postgres (`pg_trgm` and full text search with the same fusion), not because two adapters exist today.

ADR 0013 amends this decision for Plans: a Plan is built by a planning call that may run several searches over every in-stock department, and its confirmed Plan Lines enter the cart without calls 1 and 2 or the Selection Policy. Orders are matched as here.

ADR 0014 amends this decision: call 1 is gone, since the agent reads the Owner's words into tool calls. The search, call 2 and the code picking run inside the tool that resolves an Item, which offers 3 Alternatives at a time when nothing fits.

## Considered Options

- **Keep ADR 0003 and fix its prompts.** The failures came from its shape, not its wording: any word the LLM writes as a term must then appear in product names, and the LLM cannot know which words do.
- **One LLM call over the whole catalog.** The 15,180 in-stock products are about 200k tokens per order.
- **Carrefour's live search instead of the Catalog Snapshot.** It corrects typos, but returned mugs for "coca cola grande" and nothing for "sal gruesa".
- **Embeddings.** No case seen so far needs them; reopen if the eval set shows Matches missed on synonyms.
- **One call 2 for the whole order.** 22 to 31 s for 10 Items, almost all of it the model's thinking, not its input.
- **The LLM picks the product.** It would choose by price and size without seeing promotions, and could not be checked against the Selection Policy.

## Consequences

- A turn costs about 12 times what it cost on Haiku (about US$ 0.04 to 0.05 per order of 10 Items by the session's own figure), counted against the Owner's plan.
- The 15 s target holds with little room: the worst runs measured exceeded it.
- The eval set scores the product picked per Item, not a Product Type, against a list of acceptable product ids, and is relabelled when the catalog changes.
- A cart link cannot remove a line from a logged-in Carrefour cart ([Carrefour API](../references/carrefour-api.md#cart-link)), so every cart warns the Owner to empty the Carrefour cart before opening the link.
