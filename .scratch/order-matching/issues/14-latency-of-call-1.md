# 14: Latency of call 1

Type: prototype
Status: resolved
Blocked by: 12

## Question

Call 1 (`claude-haiku-5-5`, the parse-order prompt of [design.md](../design.md)) took 7.5 and 8.3 s for an order of 9 to 10 Items in [Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md), against 3.5 s in [Prototype the two calls](02-prototype-the-two-calls.md). With call 2 at about 7 s, a turn sits at the 15 s target of [Latency of call 2](10-latency-of-call-2.md). On the prototype branch `prototype/order-matching-call-2-latency`, over the same two orders, 3 runs each: how much of call 1 is thinking, input or session overhead, and how long do `claude-sonnet-5-5`, `--effort low` and a shorter prompt take, with the same Items out? Which keeps a turn of about 10 Items within 15 s, and what call 1 time does the spec target?

## Answer

Chosen by the Owner on 2026-10-15: **call 1 runs on `claude-sonnet-5-5` with `--effort low`, and writes `size` and `quantity` as short strings** (`"2.25 l"`, `"biggest"`, `"smallest"`, `"common"`; `"2 unit"`, `"300 g"`, `"minimum"`) that code parses. It took 5.4 s and 5.6 s on average (worst 6.8 s) for the two orders of 10 Items, with the same Items as the reference in all 6 runs. The spec targets call 1 at **6 s on average and 7 s at worst for about 10 Items**. The call 1 prompt and schema in [design.md](../design.md) are updated.

Prototype: branch `prototype/order-matching-call-2-latency`, commit `7d496e5` (local, not pushed). It adds `prototypes/order-matching/measure-call1.ts`, `parse-order-short.md` and `parse-order-compact.md`. Results and `summary.md` are under `prototypes/order-matching/latency-call1/`. The two orders are the ones from [Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md); there were 3 runs per variant, run one after another. The reference Items are the call 1 output that ticket 12 fed to call 2, so this measures consistency, not truth.

### Where the time goes

- **Session and API floor, about 3.5 s.** A trivial call ("return ok") takes 3.4 to 4.1 s: about 1.5 s of CLI session and 2 s of API. No call 1 variant can go below it.
- **Writing the JSON, not thinking.** Haiku thinks only 250 to 300 tokens per call 1, and Sonnet thinks none at `--effort low`. The rest of the output is the JSON, about 750 tokens. Short strings for `size` and `quantity` cut it by about a quarter.
- **Input matters little.** The 7.5 and 8.3 s seen in ticket 12 were single runs. Haiku with the same prompt now averages 5.8 and 6.0 s (worst 7.7 s).

### Call 1 time, mean of 3 runs (order of the Conversation Log / unseen order)

| variant | log | unseen | worst | Items equal to the reference |
|---|---|---|---|---|
| Haiku, current prompt | 5.8 s | 6.0 s | 7.7 s | 29/30, 25/30 |
| Haiku, `--effort low` | 4.8 | 5.2 | 6.6 | 28/30, 22/30 |
| Sonnet | 6.2 | 7.7 | 9.2 | 30/30, 30/30 |
| Sonnet, `--effort low` | 6.0 | 6.1 | 6.7 | 30/30, 29/30 |
| Haiku, prompt without Examples | 9.3 | 7.9 | 9.9 | 16/30, 28/30 |
| Haiku, short strings | 5.2 | 6.4 | 7.5 | 30/30, 28/30 |
| **Sonnet, `--effort low`, short strings** | **5.4** | **5.6** | **6.8** | **30/30, 30/30** |
| trivial call, Haiku / Sonnet | 3.6 / 3.4 | 4.1 / 3.6 | | |

### Why this one

- It is the fastest variant whose Items never drift. Haiku broke guardrails of the prompt in several runs:
  - it took "porsalud" as a brand, although the prompt says it is a variety;
  - it rewrote the brand "hellmans" as "Hellmann's", although the prompt says to keep a brand as written;
  - it read "yerba playadito 1kg" sometimes as a size and sometimes as a quantity, and "birra" as "cerveza rubia".
- It keeps one model for both calls ([Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md) chose Sonnet for call 2).
- A shorter prompt is worse. Without the Examples, Haiku thinks four times as much, takes longer and loses words ("Queso light" with brand "porsalud", "Chorizo" alone).
- Cost: about US$ 0.007 to 0.01 per call 1 by the session's own figure, against US$ 0.0006 for Haiku. On the Owner's Max plan it counts against plan usage, not as a separate charge.

### The turn

Call 1 takes about 5.5 s, call 2 about 7.4 s (ticket 12), then search and simulation follow. A turn of about 10 Items comes to about 13 to 14 s, inside the 15 s target of [Latency of call 2](10-latency-of-call-2.md) with little room. The worst cases measured (6.8 s plus call 2's 10.4 s) exceed it. Search and simulation times were not measured here.
