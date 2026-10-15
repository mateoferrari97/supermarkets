# 04: Read the order into Items with call 1

**What to build:** The `parse-order` task: `Llm.parseOrder(orderText, signal)` returns Items `{ original, product, brand, size, quantity }` with `size` and `quantity` parsed by code, plus `ignoredPreference`. Its prompt `prompts/order-matching/parse-order.md`, its output schema in `adapters/claude-code`, and models per task in the Claude Code adapter. Not yet called by the chat. See the spec, "Item and its parsing" and "LLM tasks".

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Prompt and schema: the drafts of `.scratch/order-matching/design.md` ("Call 1 prompt", "Call 1 schema"), plus `ignoredPreference` and a guardrail that a card or a preference is never an Item.
- `claude-sonnet-5-5` with `--effort low` for this task; the other existing tasks keep `claude-haiku-5-5` until they are deleted. The adapter takes a model and effort per task; `LlmCall` records the effort.
- `size` strings: `common`, `biggest`, `smallest`, or `<amount> <ml|l|g|kg>`; `quantity` strings: `minimum`, `<n> unit`, `<amount> <g|kg>`. Code parses them into the spec's `size` and `quantity` types; a string that does not parse fails the call.

## Constraints

- The `Llm` fakes in existing tests implement the new method; no other behaviour changes.

## Acceptance

- [ ] Adapter tests with a fake `ProcessRunner`: model and effort arguments, prompt file, input `<order>` wrapping, a valid output parsed into Items, an unparseable `size` or `quantity` rejected.
- [ ] Parser tests for every string form, including decimals ("2.25 l", "1.5 kg") and amounts normalized to ml and g.
- [ ] One real run of the Conversation Log order and of the prototype's unseen order: time per call (target 6 s on average, 7 s at worst for about 10 Items) and the Items, noted under Comments.
- [ ] `docs/LLM.md` describes the task, its model and effort.
- [ ] `pnpm check` exits 0.

## Comments
