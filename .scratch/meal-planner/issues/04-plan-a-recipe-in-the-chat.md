# 04: Plan a recipe and see it in the chat

**What to build:** The tracer bullet for planning. In `pnpm dev`, "quiero hacer lasaña para 4" is routed to `plan` and starts stage `planning`. The planner searches the Catalog Snapshot and answers with a Plan: the Idea (ingredients scaled to servings and the steps) and Plan Lines with snapshot prices and the total. The chat shows each search round as a step ("Buscando '<query>'") and then the Plan. The Owner can ask for changes ("que sea para 6") and gets a revised Plan. An answer with no Plan (a clarifying question) is shown as a message and stays in `planning`. Confirming comes in ticket 05.

The `plan` task works as the spec says: its input is the planning conversation, every product seen in this conversation's searches and the last Plan shown; its output is `{ kind: "search", queries }` or `{ kind: "answer", message, plan | null }`. Searches use today's `order` scope; ticket 07 widens it.

**Blocked by:** 02, 03

**Status:** resolved

- [x] Port method and Plan types in core; adapter schema, prompt rendering and `TASK_MODELS` entry (`claude-sonnet-5-5`, default effort)
- [x] `prompts/planning/plan.md` with the recipe example
- [x] `checkedPlan` with pure tests, one per rule: every product seen in a search of this conversation, quantities positive and whole for packaged products and in grams for by-weight ones, at most 8 queries and 60 lines; a by-weight quantity rounded up to its Sale Step with the same Note as Candidates; errors name the task and the rule
- [x] Search loop tests with a fake `plan` and a small catalog: up to 3 rounds per turn, 20 Matches per query, results reach the next call, a fourth `search` fails the turn, abort stops it, one step per round
- [x] Snapshot total computed in code, with a test
- [x] `ConversationState` gains `planning` (postal code, planning messages, products seen, last Plan shown); `Reply` gains `plan`
- [x] `takeTurn` wiring tests: route to planning, a revision, an answer with no Plan
- [x] `turn-events` gains a `plan` event; the chat shows the Idea sections, the table of lines (product, quantity, purpose, snapshot price) and the total; new step kinds have Spanish texts with tests
- [x] The Conversation Log records every `plan` call and search
- [x] Checked by hand in `pnpm dev` with "lasaña para 4" and one revision; screenshot in Comments
- [x] `ARCHITECTURE.md` describes a Plan end to end and the new stage; `docs/LLM.md` documents the task, its checks and the loop
- [x] `pnpm check` is green

## Comments

- Port and types: `Llm.plan` in `src/core/order-matching/llm.ts`; the Plan, `PlanInput`, `PlanOutput`, `checkPlan` and `checkedPlan` in `src/core/planning/plan.ts`; the search loop `planWithSearches` in `src/core/planning/plan-searches.ts`. The adapter renders `<conversation>`, `<products>` and `<last-plan>` (`renderPlan`), parses `planOutputSchema` and runs `plan` on `claude-sonnet-5-5` at its default effort with a budget of 1 USD per session (`TASK_BUDGETS_USD`).
- The output schema is one flat object `{ kind, queries, message, plan }` that the adapter reads into `{ kind: "search", queries }` or `{ kind: "answer", message, plan }`, so the JSON schema sent to Claude Code has an object at its top, like every other task; a search with no queries or an answer with no message fails the schema.
- `checkPlan` errors read `plan answer breaks a rule: <rule>`. "In grams" for a by-weight product is checked as whole grams. A by-weight quantity is rounded with `candidateOf`, so the line carries the Candidate's Note, and the last Plan shown keeps the rounded quantities. A line with no snapshot price shows none and is left out of the total. Lines with the same product are not merged yet (ticket 06).
- Steps: `plan` ("Armando el plan") per call and `search` ("Buscando 'q1', 'q2'") per round. A clarifying answer replies as an `ask` and keeps the last Plan shown.
- The Conversation Log records each `plan` call through `onCall` and each search as a new `search-call` event (`loggedSearch` in `src/core/conversation-log/conversation-log.ts`, wired in `openConversationLog`). It wraps every search of the conversation, so order searches are logged too.
- Hand check in `pnpm dev` on port 3400, postal code 1425. "quiero hacer lasaña para 4" ran "Entendiendo tu mensaje", "Armando el plan", one search round of 7 queries, a second round of 4 queries for the lasagna sheets, and a Plan of 7 lines with the Idea (ingredients and steps) and a total of $ 30.837,50. "que sea para 6" got a revised Plan of 9 lines for 6, total $ 53.661,90, with no new search. The Conversation Log had `llm-call` lines for `route-message` and `plan` (four) and 11 `search-call` lines. Screenshots: [04-lasagna-plan-for-4.png](../screenshots/04-lasagna-plan-for-4.png), [04-lasagna-revised-for-6.png](../screenshots/04-lasagna-revised-for-6.png). An earlier try, where the browser typed only "ña para 4" into the input while it was disabled, got a clarifying question and stayed in planning.
- `.data` is a symlink to the main checkout's data folder, so the hand check wrote its Conversation Logs into that folder's `conversations/`; nothing else there was changed.

