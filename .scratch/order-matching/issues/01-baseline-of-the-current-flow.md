# 01: Baseline of the current flow

Type: task
Status: resolved
Blocked by:

## Question

Run `pnpm order:eval` on the current flow and keep its eval run, plus the four failing Items of the 2026-10-15 Conversation Log (carbón, Port Salut light, coca zero grande, coca normal chica) run through the current flow, so the new flow has a baseline to compare against before the current one is deleted. Record the run file, hits, misses, errors, time and cost.

## Answer

Run on 2026-10-15 at commit `e34b27b`, model `claude-haiku-5-5`. Run files live under `.data/`, which is not committed; the numbers below are the record.

### Eval set (`pnpm order:eval`, all 14 cases)

- Run file: `.data/order-resolution/eval-runs/2026-10-15T18-20-57.870Z.json`.
- 13/14 hits, 0 misses, 0 errors; 1 expected to fail (`conos-de-queso`, which asks the Snack salado Group instead of returning `snacks`). No outcome changed since the run of 2026-10-14.
- 33 Claude Code sessions, 115.9 s, US$ 0.0200.
- Caveat for the comparison: the eval set scores only `resolveOrder` (Product Type, brand, quantity, terms, questions). It never checks the product picked or the cart, so it passes while the four Items below fail. The new eval set (ticket 08) has to score the product, or the new flow cannot be compared to this baseline on what failed.

### The four failing Items, end to end

Each Item was sent as its own conversation through `takeTurn` (postal code `1430`, then the Item), with the same dependencies the chat uses and live store calls, by a throwaway script. Each run wrote a Conversation Log.

| Item | Reply of the current flow | Log | Time | Cost |
| --- | --- | --- | --- | --- |
| "1 bolsa de carbon" | Product Type `carbon`, term "bolsa"; asks "no hay Carbón con \"bolsa\". ¿Lo saco o lo cambio por otra cosa?" | `.data/conversations/2026-10-15-152127-27aa16d2-12ac-4406-b5dc-10f37fcc79c6.jsonl` | 9.0 s | US$ 0.0010 |
| "Queso porsalud light" | brand "porsalud", term "light", no Product Type; asks among 34 cheese Product Types | `.data/conversations/2026-10-15-152136-a792a6a9-06d0-46ab-bfc8-08aa636de999.jsonl` | 8.2 s | US$ 0.0010 |
| "coca cola zero grande" | Product Type `gaseosa`, term "zero", vague "grande"; asks a size among 354 ml, 600 ml, 1,25 l, 1,75 l, 2,25 l | `.data/conversations/2026-10-15-152145-4ca527d4-505d-45a1-a8be-9a30749ffac3.jsonl` | 9.4 s | US$ 0.0011 |
| "coca cola normal chica" | Product Type `gaseosa`, term "normal", vague "chica"; asks "no hay Gaseosa con \"normal\". ¿Lo saco o lo cambio por otra cosa?" | `.data/conversations/2026-10-15-152154-8f93be86-d991-4630-b3f5-99d3f2e232d0.jsonl` | 15.1 s | US$ 0.0012 |

All four still fail: none reaches a cart. One difference from the Conversation Log of the morning: "normal" is now kept as a term instead of being lost, so the Item asks instead of risking a Zero; it fails the other way, because no product name has "normal".

Baseline for the new flow: 13/14 on the current eval set at about US$ 0.0014 and 8.3 s per case, and 0/4 of these Items reaching a cart at about US$ 0.0011 and 10 s each.
