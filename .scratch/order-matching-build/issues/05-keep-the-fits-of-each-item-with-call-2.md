# 05: Keep the Fits of each Item with call 2

**What to build:** The `fit-products` task, one call per Item, and `matchItems` in `src/core/order-matching/`: for a set of Items it searches each with `CatalogSearch`, runs call 2 for each with its Matches, up to 10 at a time, and returns per Item its Matches, Fits, Note, or question with up to 5 Alternatives. Not yet called by the chat. See the spec, "LLM tasks".

**Blocked by:** 03, 04

**Status:** resolved

## Decisions (agreed with the Owner)

- Prompt `prompts/order-matching/fit-products.md`: the call 2 draft of `.scratch/order-matching/design.md`, rewritten for one line per call, with its examples (Port Salut light, coca normal, provoleta Santa Julia, carbón, an unmatched cerveza) and `closest`.
- Input: `<line>` with `<original>`, `<product>`, `<brand>`, `<also-in-this-line>` only when other Items share the `original`, and `<candidates>` numbered from 1 (name, brand, `tipo`).
- Output `{ fits, closest, note, question }`; code checks numbers among the Matches, `question` exactly when `fits` is empty, `closest` at most 5 and only when `fits` is empty. A failed check fails the call.
- `claude-sonnet-5-5`, default effort. 30 Matches per Item. At most 10 calls at a time.
- `matchItems` reports a step per Item through `onStep` ("Eligiendo productos para '<original>'"), started before its search and done when its call 2 returns.

## Constraints

- An Item's call 2 failing fails the turn, as any LLM call does today.

## Acceptance

- [x] Adapter tests with a fake `ProcessRunner`: input with and without `<also-in-this-line>`, each failed check.
- [x] `matchItems` tests with a fake `Llm` and the real search over a fixture: Fits mapped back to products, Alternatives in the order given, at most 10 calls in flight, one step per Item.
- [x] One real run of the Conversation Log order: call 2 time for the order (about 7 s expected), the Fits of the four failing Items and of "1 y 1 chorizo morzilla la divisa", noted under Comments.
- [x] `docs/LLM.md` describes the task.
- [x] `pnpm check` exits 0.

## Comments

Built on 2026-10-15 from commit 979d9ee.

- `matchItems`, `FitProductsInput`, `FitProductsOutput`, `FitProductsLlm`, `ItemMatch` and `Question` in `src/core/order-matching/match-items.ts`; `Llm.fitProducts` in `src/core/order-resolution/llm.ts` with the same signature. `matchItems(items, { search, llm }, { signal, onStep })` returns one `ItemMatch` per Item in the order given: `{ item, matches, fits, note, question }`, `question` being `{ text, alternatives }` exactly when `fits` is empty. It does not apply the size and quantity rule: the caller runs `candidatesFor(match.item, match.fits)`.
- Step `{ kind: "choose-products", original }` in `src/core/order-conversation/steps.ts`, shown as "Eligiendo productos para '<original>'". A step starts when its Item is taken by one of the 10 slots, before its search, and ends when its call 2 returns. Once a call fails, no further call starts and `matchItems` rejects.
- Adapter: task `fit-products` on `claude-sonnet-5-5` with no effort flag, schema `fitProductsOutputSchema`, checks in `checkFitProducts`. Candidates are rendered `number. name | brand | Tipo`, with "sin marca" and "sin tipo" for a missing brand or Tipo. `<also-in-this-line>` joins the other products with "; ".
- Prompt `prompts/order-matching/fit-products.md`: the call 2 draft rewritten for one line per call, with `closest`, and five examples (Port Salut light, coca normal, provoleta Santa Julia, carbón, cerveza artesanal de tamarindo with no Fit), each a `<line>` and its JSON answer.
- Deviation agreed with the coordinator: `match-items.test.ts` uses a fake `CatalogSearch` over a fixture instead of the real in-memory search, because ESLint (ADR 0006) forbids a test in `src/core/` from importing `src/adapters/`. The real search has its own tests in `src/adapters/catalog-search/`.

Real run on 2026-10-15 of the Conversation Log order of 2026-10-15-110545 ("Queso porsalud light, coca cola zero grande, coca cola normal chica, picana 2kg, tira de asado 1kg, provoleta santa julia 2 unidades, 1 bolsa de carbon, 1 y 1 chorizo morzilla la divisa, sal gruesa"), with the Catalog Snapshot of `petrel/.data/carrefour/`. Call 1 ran once (10 Items, the same as in ticket 04); `matchItems` then ran 3 times over those Items with `createLlm` and `createCatalogSearch` of `compose.ts`. Wall time covers `matchItems` (10 searches and 10 calls 2, all 10 in flight at once), including starting each `claude` process; session time is each session's `duration_ms`.

| Run | Wall s | Session s (min / mean / max) | Cost US$ |
|---|---|---|---|
| 1 | 8.50 | 1.83 / 3.88 / 5.81 | 0.171 (first call writes the prompt cache) |
| 2 | 7.18 | 1.88 / 3.24 / 4.61 | 0.034 |
| 3 | 12.17 | 1.75 / 4.63 / 10.63 | 0.035 |

Mean 9.3 s against about 7 s expected. Run 3 had one session at 10.6 s and another at 9.1 s; the other two runs were 7.2 and 8.5 s. Session times rise with the order calls start in, so the 10 concurrent sessions slow each other.

No Item asked a question in any run. Fits, with how many of the 3 runs kept each:

- "Queso porsalud light" (Queso Port Salut light), 8 Fits in 3/3: Port Salut Light Cremac, La Paulina, La Serenísima sin lactosa, Tremplay, Punta Del Agua, Puyehue ("Ligth"), Carrefour Classic reducido en grasas, Silvia reducido en grasa. Note every run: "Tomé 'porsalud' como Port Salut", two runs adding that "reducido en grasa" was read as light.
- "coca cola zero grande" (Gaseosa cola zero), 5 Fits in 3/3: Coca Cola Zero 600 ml, 2,25 l, 1,75 l, 1,25 l, lata 354 ml. No Note. The size rule of ticket 06 picks the biggest among them.
- "coca cola normal chica" (Gaseosa cola sabor original), 6 Fits in 3/3: Coca Cola sabor original 220 ml, 600 ml, 2,25 l, 1,75 l, 1,25 l, lata 354 ml. No Zero and no "sabor liviano" kept. No Note.
- "1 bolsa de carbon" (Carbón para asado), 3 Fits in 3/3: "Carbon vegetal asados x 4 kg", "Carbón vegetal 4 kg.", "Carbón de leña 4 kg."; "Briquetas de carbón 5 kg." in 1/3. No question.
- "1 y 1 chorizo morzilla la divisa" as Chorizo parrillero, 2 Fits in 3/3: Chorizo super al vacio La Divisa 400 g, Chorizo puro de cerdo La Divisa 400 g; one run explained in a Note that it left out the flavoured, light and copetín ones. As Morcilla, 4 Fits in 3/3: Morcilla rosca, atada, vasca al vacio 280 g and copetín al vacio, all La Divisa; Note "Tomé 'morzilla' como morcilla."

The rest: "picana 2kg" kept only "Picaña de cerdo Etiqueta Negra x kg" with a Note that only pork picaña is there; "tira de asado 1kg" kept "Asado de Novillito" and "Asado de Novillo" (3/3) and "Asado Huella Natural trozado" (2/3) with a Note; "provoleta santa julia" kept 5 provoletas of other brands with "No hay provoleta Santa Julia; elegí otra marca."; "sal gruesa" kept 8. Some Notes explain a reading the Owner did not need ("Tomé 'picana' como picaña"); the eval set of ticket 07 is where the prompt gets tuned.

`pnpm check` exits 0.
