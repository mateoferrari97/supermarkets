---
Status: superseded by ADR-0012
---

# Resolve each Item with lexical evidence and an LLM over a tree of Product Types

Owners name things loosely: "leche", "Cindor", "medio sachet de leche", "conos de queso". Product Types form a two-level tree: a Product Type Group ("Leche") over Product Types that are interchangeable ("Leche entera", "Leche descremada"); near-duplicate Tipos such as "Pan lactal", "Pan de molde" and "Pan de mesa" are merged into one Product Type when any of them would be accepted as a replacement. To resolve an Item, a BM25 search over the product names of the Catalog Snapshot collects evidence (the 10 products named "Cindor" are all `Leche chocolatada`), and Claude Haiku 5.5 receives the Item, that evidence and the whole tree in a cached prompt, and answers `match`, `ambiguous` or `none` with candidate ids; code drops any id that is not in the tree. An `ambiguous` answer, or a Group, becomes a question to the Owner listing its children; `none` is retried once with the LLM's rewording and then becomes "what do you mean?". The LLM never settles a vague word ("grande"): it marks it, and code builds the options from the Catalog Snapshot (the Coca-Cola sizes actually in stock), so no option offered can be missing from the catalog.

Catch-all Tipos that mix products nobody would swap ("Snacks" holds crackers, cones, corn sticks and chewing gum) keep one broad Product Type. Words from the Item that narrow it ("conos", "sachet", "2,25", "sin TACC") travel as terms, and the Selection Policy only considers products whose name contains all of them; a term that matches nothing becomes a question. Concepts that span several Tipos ("snack dulce" over Alfajor, Chocolate and Galletitas dulces) are Groups.

The tree lives in the repo as two JSON files until there is a database: `product-types.json` with stable ids, names and Groups, shared by every Online Store, and one mapping per Online Store from its classification to those ids. In Carrefour's mapping `null` means reviewed and excluded (for example Cordones or Leche balsámica, a body cream) and a missing Tipo means never reviewed. The LLM proposes the first version from `tipos.json` and the Owner reviews it Sección by Sección.

## Considered Options

- **Embeddings over products or Product Types, with score thresholds.** No case seen so far needs them: the LLM already sees the whole vocabulary (the names of all 5,486 Carrefour Tipos are 94,604 characters), BM25 is stronger on brands and literal words, and scores need calibration that we do not have data for. They would add an embedding provider, a vector index and re-embedding on every Catalog Snapshot. Reopen when the vocabulary approaches 100,000 tokens (Haiku 5.5 charges five times more above that), when the eval set shows phrases with no BM25 evidence that the LLM gets wrong, or when there are many Owners.
- **Search over products alone, grouped by Product Type.** Finds brands and attributes, but a vague word like "leche" returns a mix weighted by how many products each Tipo has (92 `Leche descremada` against 54 `Leche entera`) and gives a noisy question.
- **An alias table from phrases to Product Types.** Saves a call per Item and allows manual fixes, but BM25 and the LLM already cover the cases; add it if the eval set shows phrases the LLM keeps getting wrong.
- **Splitting catch-all Tipos by Familia.** Works for some ("PAPAS FRITAS") and not for others (the Familia "SNACKS VARIOS" alone holds 75 mixed products), and adds a second key to the mapping that ADR 0001 keeps to the Tipo. Add it if the eval set needs finer questions for vague Items.
- **Product Type plus extracted attributes per product.** Needs attributes for every product; terms on the product name cover the same requests.

## Consequences

- The eval set is phrases written by the Owner. It decides Haiku 5.5 against Sonnet 5.5 and whether any rejected option comes back.
- Haiku 5.5 takes no `temperature` (Anthropic says to omit it), so the same Item can resolve differently in two orders; see ADR 0002.
