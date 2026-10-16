# 12: Measure the levers of call 2 latency

Type: prototype
Status: resolved
Blocked by: 10

## Question

On the prototype of [Prototype the two calls](02-prototype-the-two-calls.md) (branch `prototype/order-matching-two-calls`, `prototypes/order-matching/run.ts`), with the search of [Search for Matches](03-search-for-matches.md), how long does call 2 take and which Fits does it keep, over the Conversation Log order and the unseen order, 3 runs each, for: 30 against 15 Matches per Item, shorter candidate lines, one call 2 per Item in parallel (at most 5 at a time), and `claude-sonnet-5-5` against `claude-haiku-5-5`? Which combination meets the target of [Latency of call 2](10-latency-of-call-2.md) (15 s to the cart for about 10 Items) without losing Fits, and is the time in the input or the output?

## Answer

Chosen by the Owner on 2026-10-15: **call 2 runs once per Item, up to 10 at a time, on `claude-sonnet-5-5`, with 30 Matches per Item, full candidate lines, and an `<also-in-this-line>` tag** naming the other Items that call 1 read from the same words. Call 2 then takes about 7 s for 9 to 10 Items. The rule of [design.md](../design.md) now reads "one call 1 per message, one call 2 per Item"; its flow and call 2 prompt draft are updated.

Prototype: branch `prototype/order-matching-call-2-latency` (commit `e1b4998`, local, not pushed, on top of `prototype/order-matching-two-calls`), `prototypes/order-matching/measure.ts` and `analyze.ts`, results and `latency/summary.md` under `prototypes/order-matching/latency/`. The search follows [Search for Matches](03-search-for-matches.md) (`name`, `brand`, `tipo`; brandless query always; word similarity; stock and department filters; 13,030 products). Call 1 ran once per order and its output was reused, so every variant saw the same Items. Fits are scored against a reference: the products kept by more than half of all 30-Match runs. It is a consensus, not a truth; the eval set of [New eval set](08-new-eval-set.md) replaces it.

### Where the time goes

In the output, almost all of it thinking. Haiku 5.5 writes 4,000 to 8,000 thinking tokens per batch call 2, about 90% of its output, for a small JSON. Input matters little; the CLI session adds about 1.5 s per call. `MAX_THINKING_TOKENS=0` and `alwaysThinkingEnabled: false` did not reduce Haiku's thinking; `--effort low` cut it a little and unevenly.

### Call 2 time, mean of 3 runs (order of the Conversation Log / unseen order)

| variant | log | unseen | stability | note |
|---|---|---|---|---|
| Haiku, batch, 30 Matches (baseline) | 26.7 s | 36.2 s | 0.95 / 0.78 | |
| 15 Matches | 21.2 | 23.6 | 0.90 / 0.92 | loses Fits ranked 16 to 30: "Carbón de leña" (#18), briquetas (#17), papel and jamón; recall 0.75 unseen |
| shorter candidate lines | 26.5 | 32.1 | | no gain |
| Sonnet, batch | 15.4 | 19.7 | 0.97 / 0.92 | |
| Haiku, per Item, 5 at a time | 16.3 | 21.4 | | breaks the split line |
| Haiku, per Item, `--effort low`, 10 at a time | 9.5 | 11.4 | 0.90 / 0.86 | breaks the split line |
| Sonnet, per Item, 5 at a time | 13.1 | 11.7 | 0.95 / 0.91 | |
| **Sonnet, per Item, 10 at a time, line context** | **7.4** | **10.4** (6.8, 7.1, one 17.2) | **0.97 / 0.96** | chosen |

Stability is the mean Jaccard of the Fits between runs of a variant.

### Why this one

- Per Item halves the time or better (26.7 s to 7.4 s), which meets the rule of [Latency of call 2](10-latency-of-call-2.md). That rule capped parallel calls at 5; the Owner raised the cap to 10 after the measurement, since 5 calls at a time need two rounds for 10 Items.
- Per Item without context breaks a line that call 1 splits into two Items: in "1 y 1 chorizo morzilla la divisa", Haiku alone left the chorizo with no Fits in 2 of 3 runs and kept chorizos as morcillas. The `<also-in-this-line>` tag fixes it: 2 La Divisa chorizos and 4 morcillas in every run.
- Sonnet replaces Haiku as the rule of ticket 10 allowed, because its Fits are the most stable. It keeps the Hellmann's "sin tacc" mayonnaises that Haiku drops ([Prototype the two calls](02-prototype-the-two-calls.md)).
- The cost is about 12 times Haiku's: about US$ 0.03 to 0.04 per order of 10 Items by the session's own figure, US$ 0.10 to 0.16 on a run that writes the prompt cache. On the Owner's Max plan it is plan usage, not a separate charge.

### Open

- **The 15 s target is only just met.** Call 1 took 7.5 and 8.3 s in these runs (Haiku, mostly thinking), against 3.5 s in ticket 02, so a turn is about 15 s and one Sonnet outlier reached 17 s. [Latency of call 1](14-latency-of-call-1.md) measures it.
- Calls to Sonnet per Item at 10 at a time were measured only with the line context; batch Sonnet and per-Item Sonnet without context were measured with the prompt before the tag.
