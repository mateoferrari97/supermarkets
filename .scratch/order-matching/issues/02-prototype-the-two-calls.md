# 02: Prototype the two calls

Type: prototype
Status: resolved
Blocked by:

## Question

With the prompt drafts of [design.md](../design.md) and a throwaway in-memory search (BM25 plus character trigrams, fused by RRF) over the Catalog Snapshot, run the order of the 2026-10-15 Conversation Log end to end: what JSON does call 1 return, which Matches does the search bring per Item, which Fits does call 2 keep, and how long does each step take? Does the flow fix the four failing Items, and what does it get wrong?

## Answer

Verdict, accepted by the Owner on 2026-10-15: the two-call flow stays. It fixes the four failing Items; what it gets wrong is handed to tickets 03, 04, 08 and the new [Latency of call 2](10-latency-of-call-2.md).

Prototype: branch `prototype/order-matching-two-calls` (commit `a9d94be`, local, not pushed), `prototypes/order-matching/run.ts` with the two prompt drafts of [design.md](../design.md) (call 2 with four examples added) and its run files under `prototypes/order-matching/runs/`. Model `claude-haiku-5-5`, Catalog Snapshot of 2026-10-13, in-stock products only (15,180), 30 Matches per Item, BM25 and trigram top 100 each fused by RRF (k = 60), query `product + brand`. A naive size rule (exact, biggest, smallest, most frequent size read from the name, then cheapest) stands in for ticket 04.

Orders run: the order of the Conversation Log (twice) and an unseen order of 10 Items (once).

### The four failing Items

All four reach a product in both runs:

- "1 bolsa de carbon": call 1 writes "Carbón para asado", quantity 1 unit; call 2 keeps the two 4 kg carbones in the Matches, no question.
- "Queso porsalud light": 5 or 6 Port Salut light kept, note "Tomé 'porsalud' como Port Salut".
- "coca cola zero grande": the five Zero kept; the size rule picks 2,25 l.
- "coca cola normal chica": the six sabor original kept, no Zero; the size rule picks 220 ml.

### Timing and cost per order (9 to 10 Items)

- Index build 80 ms, search about 60 ms for all Items.
- Call 1: about 3.4 s inside the session, 5 s wall.
- Call 2: 22 to 31 s, about 19k characters of input (30 Matches per Item). It is almost all the time.
- Cost: US$ 0.003 to 0.0075 per order (both calls), against about US$ 0.0011 per Item in the baseline, which never reached a cart.

### What it gets wrong

- Call 1 broke a guardrail: `brand: "Porsalud"`. Call 2 recovered it.
- Search misses and noise: "Carbón de leña 4 kg" (in stock) never entered the 30 Matches; for "Picaña" the Matches are mostly "picante" products and the real one ("Tapa de cuadril (picanha)") ranks 17th. Trigrams bring the noise. The product `tipo` ("Carbón de leña", "Picanha") would have found both.
- Call 2 is unstable and sometimes breaks its rules: one run kept flavoured provoletas (finas hierbas, orégano) and code then picked one; the pork picaña was kept in one run and dropped in the other; it dropped Hellmann's "sin tacc" mayonnaises, which are the classic one; it kept chorizos with parmesan and morrón.
- Sizes read from names are wrong: "Aceite de girasol Cocinero 15 l" is 1.5 l (`consumptionQuantity` 1500, `measureUnit` CM3 in the snapshot); "4 x 30 m" is not read.
- Quantity against the way a product is sold: "3 manzanas" is 3 units of a product sold by kg; "jamon cocido 300g" picked a 200 g pack; "cheapest" compares prices per kg with prices per unit.
- The call 1 prompt has almost the same order as its example, so the run of the Conversation Log order flatters it. The unseen order also read right ("birra quilmes chica" to Quilmes 340 ml, "mayo hellmans" to Hellmann's).
