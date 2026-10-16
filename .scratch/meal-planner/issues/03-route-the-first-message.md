# 03: Route the first message to order, plan or off-topic

**What to build:** In `pnpm dev`, the first message after the postal code is labelled with its Topic by a new `Llm` task `routeMessage(text)` while the chat shows the step "Entendiendo tu mensaje". `order` runs today's flow unchanged. `off-topic` replies with the fixed text of the spec and stays in stage `order`, so the Owner can write again. `plan` replies with the same fixed text until ticket 04 hands it to planning.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Port method, output schema, prompt `prompts/planning/route-message.md` and `TASK_MODELS` entry (`claude-haiku-5-5`, default effort)
- [ ] The budget per session is set per task in the adapter
- [ ] `takeTurn` wiring tests for each Topic; a plain order still reaches `parse-order` with the same text
- [ ] The new step kind has its Spanish text, with a test
- [ ] The Conversation Log records the call like any other
- [ ] Checked by hand in `pnpm dev` with one order and one off-topic message
- [ ] `docs/LLM.md` documents the task
- [ ] `pnpm check` is green

## Comments
