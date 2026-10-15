# 05: Keep the Fits of each Item with call 2

**What to build:** The `fit-products` task, one call per Item, and `matchItems` in `src/core/order-matching/`: for a set of Items it searches each with `CatalogSearch`, runs call 2 for each with its Matches, up to 10 at a time, and returns per Item its Matches, Fits, Note, or question with up to 5 Alternatives. Not yet called by the chat. See the spec, "LLM tasks".

**Blocked by:** 03, 04

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Prompt `prompts/order-matching/fit-products.md`: the call 2 draft of `.scratch/order-matching/design.md`, rewritten for one line per call, with its examples (Port Salut light, coca normal, provoleta Santa Julia, carbón, an unmatched cerveza) and `closest`.
- Input: `<line>` with `<original>`, `<product>`, `<brand>`, `<also-in-this-line>` only when other Items share the `original`, and `<candidates>` numbered from 1 (name, brand, `tipo`).
- Output `{ fits, closest, note, question }`; code checks numbers among the Matches, `question` exactly when `fits` is empty, `closest` at most 5 and only when `fits` is empty. A failed check fails the call.
- `claude-sonnet-5-5`, default effort. 30 Matches per Item. At most 10 calls at a time.
- `matchItems` reports a step per Item through `onStep` ("Eligiendo productos para '<original>'"), started before its search and done when its call 2 returns.

## Constraints

- An Item's call 2 failing fails the turn, as any LLM call does today.

## Acceptance

- [ ] Adapter tests with a fake `ProcessRunner`: input with and without `<also-in-this-line>`, each failed check.
- [ ] `matchItems` tests with a fake `Llm` and the real search over a fixture: Fits mapped back to products, Alternatives in the order given, at most 10 calls in flight, one step per Item.
- [ ] One real run of the Conversation Log order: call 2 time for the order (about 7 s expected), the Fits of the four failing Items and of "1 y 1 chorizo morzilla la divisa", noted under Comments.
- [ ] `docs/LLM.md` describes the task.
- [ ] `pnpm check` exits 0.

## Comments
