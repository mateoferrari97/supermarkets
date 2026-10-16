# 03: Route the first message to order, plan or off-topic

**What to build:** In `pnpm dev`, the first message after the postal code is labelled with its Topic by a new `Llm` task `routeMessage(text)` while the chat shows the step "Entendiendo tu mensaje". `order` runs today's flow unchanged. `off-topic` replies with the fixed text of the spec and stays in stage `order`, so the Owner can write again. `plan` replies with the same fixed text until ticket 04 hands it to planning.

**Blocked by:** 02

**Status:** resolved

- [x] Port method, output schema, prompt `prompts/planning/route-message.md` and `TASK_MODELS` entry (`claude-haiku-5-5`, default effort)
- [x] The budget per session is set per task in the adapter
- [x] `takeTurn` wiring tests for each Topic; a plain order still reaches `parse-order` with the same text
- [x] The new step kind has its Spanish text, with a test
- [x] The Conversation Log records the call like any other
- [x] Checked by hand in `pnpm dev` with one order and one off-topic message
- [x] `docs/LLM.md` documents the task
- [x] `pnpm check` is green

## Comments

- `routeMessage(text)` is on the `Llm` port (`src/core/order-matching/llm.ts`); the Topic type and `RouteMessageLlm` live in the new `src/core/planning/route-message.ts`. The adapter wraps the text in `<message>`, parses `{ topic }` with `routeMessageOutputSchema` and runs `route-message` on `claude-haiku-5-5` at its default effort; the prompt is `prompts/planning/route-message.md`.
- The budget per session is `TASK_BUDGETS_USD` per task (0.25 USD for each today); the option `budgetUsd` became `budgetsUsd`, a partial map per task. Nothing outside the adapter passed it.
- `takeTurn` routes only in stage `order`, under the step `understand-message` ("Entendiendo tu mensaje"). `off-topic` and `plan` both answer `OFF_TOPIC_TEXT` and keep the state; replies to questions or a cart are not routed. Wiring tests in `take-turn.test.ts` (`routing`), step text in `step-text.test.ts`, adapter tests in `claude-code-llm.test.ts` (`routeMessage`, `budget per session`).
- Hand check in `pnpm dev` on port 3300, postal code 1425: "¿a qué hora juega Boca el domingo?" got the fixed text with the step "Entendiendo tu mensaje"; then "yerba playadito 1 kg" ran "Entendiendo tu mensaje", "Entendiendo el pedido" and "Eligiendo productos" as today and asked about the yerba. The Conversation Log had `llm-call` lines for `route-message` (twice), `parse-order` and `fit-products`. Screenshot: [03-off-topic-then-order.png](../screenshots/03-off-topic-then-order.png).
- `.data` is a symlink in this worktree, which `.gitignore`'s `.data/` does not match; it is excluded locally in `.git/info/exclude` so `pnpm docs:check` and `git status` stay clean.
- `ARCHITECTURE.md` and `docs/LLM.md` describe the task, the step and the fixed text.

