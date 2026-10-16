# 10: Latency of call 2

Type: grilling
Status: resolved
Blocked by: 03

## Question

Call 2 takes 22 to 31 s for an order of 9 to 10 Items with 30 Matches each (see [Prototype the two calls](02-prototype-the-two-calls.md)), almost all of the time of a turn. What latency is acceptable for the Owner, and how is it reached: fewer Matches per Item, shorter candidate lines, another model, streaming progress to the chat, or call 2 split into one call per Item run in parallel (which reopens the "two calls per message" decision of design.md)?

## Comments

- From [Questions and answers in the new flow](05-questions-and-answers.md): call 2 also returns `closest` (up to 5 Alternatives) when no Match fits, and a reply that yields new lines runs call 2 again for those lines only.
- From [New eval set](08-new-eval-set.md): `pnpm order:eval` reports time per case and runs each case 3 times, so a latency change can be measured against Fits precision and recall on the same set.

## Answer

Agreed with the Owner on 2026-10-15.

- **Target**: for an order of about 10 Items, the cart or the questions reach the Owner within 15 s of the message, checkout simulation in the Branch not counted, with progress shown per Item. Over 30 s is never acceptable, even with progress.
- **Measure before choosing**: no lever is chosen by judgement. [Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md) runs the variants on the prototype and picks the combination; this ticket fixes the target and the rules it is picked by.
- **One call 2 per Item, in parallel, if it pays**: accepted when the measurement shows it at least halves the time of call 2 without losing Fits, with at most 5 calls at a time. The rule of [design.md](../design.md) then reads "one call 1 per message, one call 2 per Item"; otherwise it stays two calls per message.
- **Progress in the chat**: one step per Item ("Eligiendo productos para 'coca zero grande'"), marked done when its call 2 returns, over the existing `step-started` and `step-done` events (`src/app/turn-events.ts`).
- **Model**: `claude-haiku-5-5` stays the default (`src/adapters/claude-code/claude-code-llm.ts:16`). Sonnet is tried in the measurement and replaces it only if it makes Fits more stable without breaking the 15 s target.

Facts behind it: in the prototype run `log-2026-10-15T18-26-11-079Z.json`, call 2 took 22.3 s inside the session (23.2 s wall) for 19,085 characters of input and US$ 0.0053; call 1 took 3.5 s. Whether the time comes from the input (30 Matches per Item) or the output is not known; the measurement finds out.
