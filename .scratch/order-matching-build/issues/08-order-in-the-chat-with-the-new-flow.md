# 08: Order in the chat with the new flow

**What to build:** Switch `takeTurn` and the chat to the new flow for an order with no questions: call 1, `matchItems`, Candidates, each Candidate simulated alone in the Branch, the Selection Policy, the whole cart simulated with substitution, and the cart message with Notes as the spec's "Cart message and Notes" says. The old flow is no longer called; ticket 11 deletes it. See the spec, "Turn" and "Cart message and Notes".

**Blocked by:** 07

**Status:** resolved

## Decisions (agreed with the Owner)

- Simulation: each Candidate alone at its quantity, at most 10 simulations at a time across the order; unavailable ones dropped; Selection Policy picks; then one simulation of the whole cart; a product unavailable there is replaced by the Item's next ranked Candidate with a Note. An Item with every Candidate unavailable goes to the block with a Note.
- Cart message: `notices` renamed `notes`; Notes under their line in the spec's order (call 2 first, then code); the block after the table (Items not got, then the ignored card or preference); no "Sin producto" rows; the fixed warning before the link on every cart; "El precio cambió al armar el carrito" and "La búsqueda no lo encontró: lo elegí del catálogo" gone; the quantity promotion hint kept, read from snapshot teasers and confirmed by simulation.
- Steps: "understand the order", one per Item, "simulate the cart"; the search and Carrefour candidate steps are removed, with their texts in `src/app/step-text.ts`.
- `OnlineStore.findCandidates` and live search are no longer called.
- Until ticket 09, an Item with no Fit is not asked: it goes to the block as not got, with call 2's question as its Note. Ticket 09 replaces this.

## Constraints

- The chat still ends on the cart until ticket 10.
- The Conversation Log keeps recording every LLM and store call.

## Acceptance

- [x] `takeTurn` tests with fakes: a cart with Notes under lines and in the block, the warning, substitution at the final simulation, an Item with every Candidate unavailable, an Item with no Fit, `ignoredPreference`, steps in order, abort.
- [x] One real order of about 10 Items in the chat (`pnpm dev`), including the four failing Items of the baseline: Conversation Log path, the cart, and times of call 1, search, call 2 and simulation noted under Comments, against the 15 s target (simulation not counted).
- [x] `ARCHITECTURE.md` "An order end to end" describes the new flow; ADR 0005's amendment holds.
- [x] `pnpm check` exits 0.

## Comments

### Build (2026-10-15)

- `takeTurn` (`src/core/order-conversation/take-turn.ts`) now runs call 1, `matchItems`, `candidatesFor` and `simulateCart` (`src/core/product-selection/cart.ts`, new): each Candidate simulated alone, at most 10 at a time across the order, the Selection Policy, one whole-cart simulation with substitution by the next ranked Candidate. States: `postal-code`, `order`, `done`; replies `ask` and `cart`. `ConversationDependencies` is `{ llm, search, store, signal? }`; `compose` builds the search from the Catalog Snapshot and still loads the vocabulary only because the Claude Code adapter needs it to be created (ticket 11).
- Cart: `notes` per line (call 2 Note, then candidate Notes, substitution, quantity promotion hint), block `notes` (Items not got, then `IGNORED_PREFERENCE_NOTE`), `warning` (the fixed sentence) shown before the link; no "Sin producto" rows; the price-changed and "La búsqueda no lo encontró" notices are gone with the old pick.
- Steps: `search-item` and `find-candidates` removed from `Step` and `step-text.ts`; `resolve-order.ts` and `pick-products.ts` (old flow, no longer called) just stopped reporting them.
- `inParallel` moved out of `match-items.ts` into `src/core/order-matching/in-parallel.ts` so the simulations share it; `rankBySelectionPolicy` is generic so the simulated line travels with each Candidate.
- Not got Notes: no Fit gives `No conseguí "<original>": <call 2 question>`; every Candidate unavailable gives `No conseguí "<original>": no hay ninguno disponible en tu sucursal`; Fits the size and quantity rule leaves empty give `... no encontré cómo llevar lo que pediste`.

### Real order in the chat

- Run through the chat server (`pnpm dev --port 3018`, `POST /api/turn` as the browser does, read with curl), postal code 1430, the order of the 2026-10-15 log: "Queso porsalud light, coca cola zero grande, coca cola normal chica, picana 2kg, tira de asado 1kg, provoleta santa julia 2 unidades, 1 bolsa de carbon, 1 y 1 chorizo morzilla la divisa, sal gruesa" (10 Items).
- Conversation Log: `.data/conversations/2026-10-15-181337-162f702f-700b-46b5-a18d-135c2461562a.jsonl`.
- Cart (total $89 273,60, empty block, warning before the link):
  - Queso porsalud light → Queso Port Salut Light La Paulina horma x kg; Note "Tomé 'porsalud' como Port Salut y 'light' también como 'reducido en grasa'."
  - coca cola zero grande → Gaseosa cola Coca Cola Zero 2,25 lts
  - coca cola normal chica → Gaseosa cola Coca Cola sabor original 220 ml
  - picana 2kg → Picaña de cerdo Etiqueta Negra x kg ×3; Notes "Tomé 'picana' como picaña. La única que hay es de cerdo (Etiqueta Negra)." and "Picaña se vende de a 600 g: llevo 1,8 kg"
  - tira de asado 1kg → Asado de Novillo x kg; Notes on the name and "Tira de asado se vende de a 1,2 kg: llevo 1,2 kg"
  - provoleta santa julia 2 unidades → Queso provoleta Carrefour classic 190 g ×2; Note "No hay provoleta Santa Julia; elegí otra marca."
  - 1 bolsa de carbon → Carbón de leña 4 kg
  - 1 y 1 chorizo morzilla la divisa → Chorizo super al vacio La Divisa 400 grs, and Morcilla atada La Divisa 400 grs with "Tomé 'morzilla' como morcilla."
  - sal gruesa → Sal gruesa Carrefour Classic 1 kg (promotion)
- The four failing Items of the baseline (carbón, Port Salut light, coca zero grande, coca normal chica) all reached the cart, against 0 of 4 in the baseline.
- Times: call 1 step 4.98 s (session 3.47 s); search 3 to 25 ms per Item over the real snapshot (measured apart with `createCatalogSearch`, 0.1 s for the 10 Items; index built once in 0.3 s when the chat loads); call 2 steps 3.9 to 7.3 s in parallel, the slowest ending 7.34 s after call 1; simulation 1.37 s (26 single-Candidate simulations plus one of the whole cart). Turn 13.68 s in all, 12.3 s without simulation: within the 15 s target.
- Seen but outside this ticket: by-weight lines show the number of Sale Steps in "Cant." (3 for 1,8 kg), as the old cart did; 2 kg of picaña rounds down to 1,8 kg by the nearest-multiple rule of ticket 06.
