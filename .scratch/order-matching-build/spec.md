Status: ready-for-agent

# Match Items to catalog products with two LLM calls around a search

## Problem Statement

The Owner orders in the chat, and the current flow fails Items it should get. In the Conversation Log of 2026-10-15 four Items of one order never reached the cart: "1 bolsa de carbon" asked about "bolsa" in a loop although three carbones were in stock, "Queso porsalud light" took "porsalud" as a brand and offered 34 cheese Product Types, "coca cola zero grande" asked a size with 354 ml among the options, and "coca cola normal chica" lost "normal". The LLM writes a brand and terms without seeing the catalog, and code then needs those exact words in product names. The eval set passes 13 of 14 cases because it scores Product Types, never the product picked.

## Solution

The flow of ADR 0012 replaces the current one, with no side by side for the Owner:

```
Owner's message
  -> call 1 (LLM, parse-order): order -> Items (original, product, brand, size, quantity) + ignoredPreference
  -> code, per Item: CatalogSearch.findMatches over the Catalog Snapshot -> 30 Matches
  -> call 2 (LLM, fit-products), one per Item, up to 10 at a time: Item + Matches -> Fits and a Note, or a question with up to 5 Alternatives
  -> code: size and quantity rule over the Fits -> up to 10 Candidates per Item
  -> no question open: each Candidate simulated alone in the Branch, Selection Policy picks, whole cart simulated
  -> cart with Notes, or the questions
Owner's next reply (answers or Corrections)
  -> call 1 in follow-up mode (read-reply): one entry per Item touched -> the flow again for those Items only
```

Product Types, the Tipo mapping, the seed, live search and the old tasks (`split-order`, `resolve-item`, `reword-item`, `map-answer`) are deleted. The eval set is rebuilt to score the product picked.

The build is eleven tickets in `issues/`. Every ticket ends with `pnpm check` at 0. Tickets 02 to 07 build the new flow beside the old one without wiring it to the chat; ticket 08 switches the chat to it; ticket 11 deletes what is left of the old flow. Each ticket updates the docs it touches.

## User Stories

1. As the Owner, I want to write my order the way I talk ("coca cola zero grande", "1 y 1 chorizo morzilla la divisa", "queso porsalud light"), so that I never rewrite it for the Assistant.
2. As the Owner, I want a misspelt product or brand read as what I meant, and told so in a Note ("Tomé 'porsalud' como Port Salut"), so that I can check it.
3. As the Owner, I want a variant I name ("light", "zero", "normal", "descremada", "sin TACC") kept, and the standard version when I name none, so that I never get a Zero when I asked for a normal one.
4. As the Owner, I want "grande" to be the biggest size Carrefour sells of that product and "chica" the smallest, so that I am not asked about sizes.
5. As the Owner, I want the most common size when I give none, and the nearest size with a Note when the one I give does not exist, so that I am not asked.
6. As the Owner, I want the smallest amount Carrefour sells when I give no quantity, so that I get one of each by default.
7. As the Owner, I want a weight I ask for ("picaña 2 kg", "jamón cocido 300 g") met by the cheapest option, packaged or sold by weight, rounded to what Carrefour sells, with a Note when the amount changes, so that I get what I asked for at the best price.
8. As the Owner, I want a brand I name that Carrefour lacks replaced by the same product of another brand, with a Note, so that I get the Item instead of a question.
9. As the Owner, I want to be asked only when nothing in the catalog fits an Item, with up to 5 alike products I can pick by number, so that questions are few and quick to answer.
10. As the Owner, I want to answer a question with a number, another brand ("dale, una Patagonia"), "sacala", or by adding things ("agregá un vino tinto"), so that I answer the way I talk.
11. As the Owner, I want an Item asked at most twice and then left out with a Note, so that a question never loops.
12. As the Owner, I want a question I ignored asked again with the same products and numbers, so that "la 2" still means what it meant.
13. As the Owner, I want no cart until every question is answered, so that the cart I open is complete.
14. As the Owner, I want to correct the cart after I see it ("cambiá el carbón por Patagonia", "la coca de 1,5", "sacá el queso"), and get a new cart with every line, the new and changed ones marked, so that I fix it without starting over.
15. As the Owner, I want the conversation to stay open after the cart, so that I can correct it as many times as I need.
16. As the Owner, I want each Note under the cart line it is about, and a block after the table for Items I did not get, Items I removed and a card or preference that was ignored, so that I read every Note where it belongs.
17. As the Owner, I want a Note only when the Assistant did something I did not ask for, never for a default I left open, so that Notes are worth reading.
18. As the Owner, I want every cart to tell me to empty my Carrefour cart before opening the link, so that items of an earlier cart do not stay in it.
19. As the Owner, I want to see one progress step per Item while products are chosen, so that I know the Assistant is working on my list.
20. As the Owner, I want the cart or the questions within about 15 s of my message for an order of about 10 Items, checkout simulation not counted, so that ordering stays quick.
21. As the Owner, I want prices, stock and promotions of my Branch in the cart, so that what I see is what I pay.
22. As the Owner, I want to be told once that cards and preferences are not taken into account yet when I write one, so that I do not believe they were applied.
23. As the operator, I want `pnpm carrefour:catalog` to download the Sale Step and promotions with each product, so that the snapshot has what the flow reads.
24. As the developer, I want `pnpm order:eval` to score the product picked per Item against acceptable product ids, with wrong picks nobody sees as the headline number, so that a prompt or search change is measured on what the Owner gets.
25. As the developer, I want each eval case run 3 times and its stability reported, so that an unstable call 2 shows up.
26. As the developer, I want a helper that lists likely products per Item from the Catalog Snapshot, so that labelling eval cases is quick.
27. As the developer, I want stale product ids in the eval set reported, not failed, so that a catalog change does not break the eval.
28. As the developer, I want the search behind a `CatalogSearch` port, so that it can move to Postgres later without touching the flow.
29. As the developer, I want no Product Type code, data, commands or skills left in the repo, so that nobody maintains what the flow no longer reads.

## Implementation Decisions

The answers of the map `.scratch/order-matching/` hold the detail behind each decision; the design and prompt drafts are in `.scratch/order-matching/design.md`.

Item and its parsing:

- An Item is `{ original, product, brand, size, quantity }`. Call 1 writes `size` and `quantity` as strings; code parses them into `size: { kind: "common" } | { kind: "biggest" } | { kind: "smallest" } | { kind: "exact", dimension, amount }` and `quantity: { kind: "minimum" } | { kind: "units", count } | { kind: "weight", grams }`, with amounts normalized to ml, g, units or metres. A string the parser rejects fails the call, like a schema error.
- `ignoredPreference` is a boolean of call 1's output (ADR 0011); code writes the fixed sentence "Por ahora no tengo en cuenta tarjetas ni preferencias."

Catalog Snapshot (ticket 02):

- `pnpm carrefour:catalog` keeps `measurementUnit` and `unitMultiplier` of each product's first item and its teasers (`PromotionTeasers`: name and `Conditions.MinimumQuantity`) from the endpoint it already calls. Checked on 2026-10-15: `catalog_system/pub/products/search` returns `measurementUnit`, `unitMultiplier` and `Teasers`/`PromotionTeasers` per item ("Gaseosa cola Coca Cola sabor original 2,25 lts", teaser "PROMO-2do al 50% …", minimum quantity 2).
- A product is sold by weight when `measurementUnit` is `kg`; its Sale Step is `unitMultiplier` in kg. Its size is none. A packaged product's size comes only from `measureUnit` and `consumptionQuantity`; names are never read for sizes. A product without them has no size.
- Snapshot teasers are only a hint: the quantity promotion Note is shown only when a simulation at the teaser's minimum quantity confirms a lower unit price, as today.
- The loader requires the new fields; an older `products.json` fails with a message to run `pnpm carrefour:catalog` again.

Search (ticket 03, ADR 0012):

- Port `CatalogSearch` in core: `findMatches(item: { product, brand }, limit): CatalogProduct[]`, one Item per call, synchronous. One adapter, in memory, built from the Catalog Snapshot through `compose`.
- Indexed text per product: `name`, `brand`, `tipo`; no category path.
- Without a brand, one query, `product`. With a brand, two queries, `product` and `product + brand`, fused. The brand is never a filter.
- Two rankings per query: BM25 on words (the current `bm25.ts` moves into the adapter) and word similarity on character trigrams (for each query word, its best trigram similarity to a word of the document, averaged over the query words). All rankings fused by RRF, k = 60; ties by catalog order.
- Left out before indexing: `availableQuantity` 0, and the departments Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería, Aire Libre y Ocio.
- `limit` 30.

LLM tasks and the `Llm` port:

- Three tasks, prompts under `prompts/order-matching/`: `parse-order` (call 1), `fit-products` (call 2), `read-reply` (call 1 in follow-up mode). Inputs wrapped in XML tags; outputs JSON with a schema, parsed by zod in `adapters/claude-code`.
- Models per task, fixed in the Claude Code adapter: `parse-order` and `read-reply` on `claude-sonnet-5-5` with `--effort low`; `fit-products` on `claude-sonnet-5-5` with its default effort. `LlmCall` records the effort beside the model.
- `parse-order` prompt and schema: the drafts of `design.md`, plus `ignoredPreference`. No eval case may copy its example order.
- `fit-products`, one call per Item: input `<line>` with `<original>`, `<product>`, `<brand>`, `<also-in-this-line>` (the `product` of the other Items with the same `original`, only when there are any) and `<candidates>` (the Matches numbered from 1, full name, brand and `tipo`). Output `{ fits: number[], closest: number[], note: string | null, question: string | null }`. Code checks every number is among the Item's Matches, `question` is set exactly when `fits` is empty, and `closest` has at most 5 numbers and only when `fits` is empty; a failed check fails the call.
- At most 10 `fit-products` calls run at a time.
- `read-reply` input: every Item of the conversation, numbered: asked Items with `original`, the question and its Alternatives by number; Items in the cart with `original` and the product bought; plus the Owner's reply. Output: `entries`, each `{ item, kind: "choice", alternative } | { item, kind: "lines", lines: Item[] } | { item, kind: "drop" } | { item, kind: "unanswered", question: string | null }`, plus `newLines: Item[]` and `ignoredPreference`. One entry at most per Item; `choice` and `unanswered` only for asked Items, except `unanswered` with a question for an ambiguous Correction ("¿cuál coca, la zero o la normal?"). An asked Item with no entry counts as `unanswered`.

From Fits to Candidates (ticket 06), pure code over Snapshot data:

- Size rule, applied to the Fits:
  - `common`: the mode of (dimension, amount) among packaged Fits; a tie goes to the size whose cheapest Fit is cheapest per unit of measure. Fits without size enter only here. When every Fit is sold by weight, no size rule applies.
  - `biggest`, `smallest`: packaged Fits of the majority dimension only. When no Fit is packaged the size is ignored, with a Note.
  - `exact`: that size; when missing, the nearest size in the same dimension, the bigger on a tie, with a Note ("No hay de 2,25 l; llevo 2 l").
- Quantity:
  - `minimum`: one unit of a packaged product, one Sale Step of a product sold by weight.
  - `units`: that many of a packaged product. For a product sold by weight, packaged Fits come first; with none, one Sale Step per unit, with a Note ("Carrefour vende por kg: llevo 1,5 kg").
  - `weight`: replaces the size rule unless the size is `exact`. Every option that gives the weight: each Fit sold by weight at the weight rounded to its Sale Step, each packaged Fit at n = ⌈weight ÷ size⌉ when the total exceeds the weight by less than one package.
  - Rounding to the Sale Step goes to the nearest multiple, at least one step, with a Note when the amount changes ("La picaña se vende de a 1,25 kg: llevo 2,5 kg").
- Candidates: the options left, at most 10 per Item, the cheapest per unit of measure by snapshot price (total ÷ (quantity × size), or ÷ kg sold by weight).
- Selection Policy over simulated Candidates: savings first, then lowest price per unit of measure, then lowest `itemId` (ADR 0011).

Turn (tickets 08 to 10):

- `takeTurn` keeps the postal code stage. After it, every reply is either an order (first message) or read by `read-reply`.
- State per Item: its `original`, parsed Item, Matches, Fits, the call 2 Note, its Candidates and code Notes, questions spent (0 to 2), the open question with its Alternatives, the product bought and its quantity once a cart exists, and whether it was added or changed since the last cart.
- Questions: when any Item has no Fit, the reply is one numbered message, each question with up to 5 Alternatives by name and Catalog Snapshot price. Items with Fits are kept and not recomputed; nothing is simulated. The chat shows each Alternative as a chip; the "cualquiera" chip is removed.
- Entries of `read-reply`: `choice` buys that Alternative as is, with the Item's quantity, no search, no call 2, no size rule; `lines` replaces the Item by new Items that run search, call 2 and the size rule, each with 2 new questions; `drop` removes it (block Note "Saqué: …"); `unanswered` spends one question and re-asks in code the same text and Alternatives prefixed "Me falta saber de <original>:", with no LLM call. An answer that leads to no Fit also spends one. After the second question the Item is dropped with a block Note. `newLines` run the whole flow as new Items.
- Once no question is open: each Candidate of each Item to buy is simulated alone at its quantity, at most 10 simulations at a time across the order; unavailable ones are dropped; the Selection Policy picks. An Item whose Candidates are all unavailable goes to the block with a Note, with no question. The whole cart is then simulated once; a product unavailable there is replaced by the Item's next ranked Candidate, with a Note.
- After a cart the conversation stays open. A Correction reruns only the corrected Items; Items not touched keep the product bought, and the whole cart is simulated again. There is no end state: the conversation ends when the Owner closes the chat or reloads. The session is deleted after one hour without a turn or when a turn fails, no longer when the cart is delivered.

Cart message and Notes (ticket 15 of the map):

- `notices` is renamed `notes` everywhere.
- Under each line, in order: the call 2 Note, then code Notes in flow order: size, Sale Step rounding, units of a product sold by weight, substitution at the final simulation, quantity promotion hint ("Llevando 2 sale … c/u en vez de …").
- After the table, a block in order: Items not got (dropped after two questions, or every Candidate unavailable), Items removed ("Saqué: carbón"), the ignored card or preference. No "Sin producto" rows.
- No Note for a default. "El precio cambió al armar el carrito" and "La búsqueda no lo encontró: lo elegí del catálogo" are deleted.
- Before the link, on every cart, the fixed sentence: "Antes de abrir el link, vaciá tu carrito de Carrefour: el link agrega productos pero no saca los que ya estaban."
- Later carts show every line; lines added since the last cart are marked "Nuevo", corrected ones "Cambiado", without the previous product. A Note shows in the first cart that holds its Item; a later cart shows only the Notes of its marked lines and of its own block.
- Layout as today's `CartView`.

Progress steps: "understand the order" (call 1), "understand the reply" (`read-reply`), one step per Item while its search and call 2 run ("Eligiendo productos para 'coca zero grande'"), "simulate the cart". The search and Carrefour candidate steps are removed.

Eval set (ticket 07):

- `evals/order-matching.json` replaces `evals/order-resolution.json`; eval runs go to `.data/order-matching/eval-runs/`. Commands keep their names.
- Order case: `id`, `order`, optional `expectedToFail`, optional `ignoredPreference`, `notItems` (words that must not become Items) and `items`, each with `brand`, `size` kind, `quantity`, and either `fits` (every acceptable in-stock `productId`) with an optional `pick` (subset of `fits`), or `alternatives` (acceptable Alternatives) for an Item that must ask.
- Answer case (added in ticket 09): fixed open questions (the Item's `original`, question text, Alternatives by `productId`) and resolved Items, the Owner's reply, and the expected entries (`choice` with its number, `lines` with product and brand, `drop`, `unanswered`) and `newLines`. It runs only `read-reply`.
- A run goes through call 1, search, call 2, the size and quantity rule and the Selection Policy on snapshot prices, no simulation. 3 runs per case, `--runs N`.
- Metrics per case and in total: Items read right (number of Items, `brand`, `size` kind, `quantity`, `notItems`; `product` not compared), Matches recall, Fits precision and recall, pick right, wrong picks nobody sees (headline: wrong pick with no Note and no question), question rate, Alternatives in `alternatives`, `ignoredPreference`, stability (same Fits and pick across runs), sessions, time and cost. The run file records the Catalog Snapshot's date.
- A case passes when every run gives each Item a right pick or the expected question; `pnpm order:eval` exits 1 when a case not marked `expectedToFail` fails. An expected `productId` missing or out of stock is reported as stale, not failed.
- `pnpm order:eval-set` validates with zod: unique ids, non-empty `productId`s without repeats inside an Item, `pick` within `fits`, `alternatives` only without `fits`, no order equal to an example order in `prompts/`. It never reads the Catalog Snapshot.
- `pnpm order:label <words>` lists likely products from the Catalog Snapshot for a phrase (the search's top 50, with `productId`, name, brand, size and stock) so a human can label a case.
- Cases: rewritten from the current set `nada-de-huevos`, `envio-a-codigo-postal`, `marca-de-una-lista`, `marca-con-tambien`, `coca-de-2-25`, `leche-descremada-with-brand`, `un-par-de-yogures`, `medio-sachet-de-leche`, `dos-cocas-grandes`; added: the four failing Items of the 2026-10-15 Conversation Log as short orders that do not copy the prompt example, the prototype's unseen order (`prototypes/order-matching/` on the local branch `prototype/order-matching-call-2-latency`), "pago con Visa" and "nada de Marolio" expecting `ignoredPreference`; dropped: `leche-is-a-group`, `cindor-brand-only`, `conos-de-queso`.

Layout:

- `src/core/order-matching/`: the Item and its parsing, the `Llm` port with the three tasks, the `CatalogSearch` port, `matchItems` (search, call 2 and the size and quantity rule for a set of Items), the eval set and its scoring.
- `src/core/product-selection/`: the size and quantity rule, Candidates, the Selection Policy, simulation of Candidates and of the cart, Notes, the cart; the `OnlineStore` port without `findCandidates`; postal codes.
- `src/core/order-conversation/`: `takeTurn` and its steps.
- `src/adapters/catalog-search/`: the in-memory `CatalogSearch`.
- `src/core/order-resolution/`, `src/core/product-types/`, `src/core/product-type-seed/` and `src/core/catalog/` (sizes from names) are deleted by the end; `text.ts` moves where the search needs it.

## Testing Decisions

- Good tests check behaviour through public functions: what the Owner is asked and gets, what the LLM, the search and Carrefour are asked, what a command prints and its exit code. Not how state is stored.
- Search: tests over a small fixture snapshot through the real in-memory adapter, no fake: "porsalud" reaches Port Salut, "Carbón para asado" reaches "Carbón de leña" through `tipo`, "Picaña" ranks the picanha above "picante" products, a brand the snapshot lacks still returns the product, stock and department filters, stable order on ties.
- Size and quantity rule and Selection Policy: table tests per rule of the decisions above, with the Notes each produces. Prior art: `pick-products.test.ts`.
- Claude Code adapter: per task, the model and effort arguments, the prompt file, the input sent, and the checks code adds (numbers outside the Matches, `question` without empty `fits`, too many `closest`, unparseable `size` or `quantity`). Prior art: `claude-code-llm.test.ts` with a fake `ProcessRunner`.
- `takeTurn`: fakes of `Llm` and `OnlineStore` and the real search over a fixture: cart without questions, questions with Alternatives, each `read-reply` entry kind, the 2-question limit, re-asking in code, Corrections, "Nuevo" and "Cambiado", Notes placement and once-only showing, the cart warning, steps per Item, abort. Prior art: `take-turn.test.ts`.
- Carrefour adapter and catalog download: recorded fixtures for the new fields. Prior art: `catalog-download.test.ts`, `carrefour-store.test.ts`.
- Eval set and scoring: validation and metrics with fixed inputs. Prior art: `eval-set.test.ts`, `eval-run.test.ts`.
- No live calls in tests. Real LLM behaviour is measured with `pnpm order:eval`; the chat and its latency are checked by real orders recorded in each ticket's Comments with their Conversation Log path.

## Out of Scope

- The Payment Card and the preference (ADR 0011).
- Moving the search or the data to Supabase; embeddings or any semantic search.
- Remembering anything between conversations.
- Removing lines from a logged-in Carrefour cart through the link (`qty=0` is untested).
- Tuning the Matches limit, the excluded departments or the prompts beyond what the eval set of ticket 07 shows on its first run.

## Further Notes

- Decisions and measurements: the map `.scratch/order-matching/map.md` and its tickets; prototypes on local branches `prototype/order-matching-two-calls` and `prototype/order-matching-call-2-latency` (not pushed).
- Baseline to compare against: 13/14 on the old eval set and 0 of the 4 failing Items reaching a cart ([Baseline of the current flow](../order-matching/issues/01-baseline-of-the-current-flow.md)).
- Latency targets: call 1 at 6 s on average and 7 s at worst for about 10 Items; call 2 about 7 s; the cart or the questions within 15 s for about 10 Items, simulation not counted. Search and simulation times were never measured; ticket 08 records them.
- Ticket 06 of the map removed the Payment Card and the preference in the working tree before this build (ADR 0011). That change has to be committed before ticket 01 starts.
