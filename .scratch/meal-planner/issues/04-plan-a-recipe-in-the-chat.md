# 04: Plan a recipe and see it in the chat

**What to build:** The tracer bullet for planning. In `pnpm dev`, "quiero hacer lasaña para 4" is routed to `plan` and starts stage `planning`. The planner searches the Catalog Snapshot and answers with a Plan: the Idea (ingredients scaled to servings and the steps) and Plan Lines with snapshot prices and the total. The chat shows each search round as a step ("Buscando '<query>'") and then the Plan. The Owner can ask for changes ("que sea para 6") and gets a revised Plan. An answer with no Plan (a clarifying question) is shown as a message and stays in `planning`. Confirming comes in ticket 05.

The `plan` task works as the spec says: its input is the planning conversation, every product seen in this conversation's searches and the last Plan shown; its output is `{ kind: "search", queries }` or `{ kind: "answer", message, plan | null }`. Searches use today's `order` scope; ticket 07 widens it.

**Blocked by:** 02, 03

**Status:** ready-for-agent

- [ ] Port method and Plan types in core; adapter schema, prompt rendering and `TASK_MODELS` entry (`claude-sonnet-5-5`, default effort)
- [ ] `prompts/planning/plan.md` with the recipe example
- [ ] `checkedPlan` with pure tests, one per rule: every product seen in a search of this conversation, quantities positive and whole for packaged products and in grams for by-weight ones, at most 8 queries and 60 lines; a by-weight quantity rounded up to its Sale Step with the same Note as Candidates; errors name the task and the rule
- [ ] Search loop tests with a fake `plan` and a small catalog: up to 3 rounds per turn, 20 Matches per query, results reach the next call, a fourth `search` fails the turn, abort stops it, one step per round
- [ ] Snapshot total computed in code, with a test
- [ ] `ConversationState` gains `planning` (postal code, planning messages, products seen, last Plan shown); `Reply` gains `plan`
- [ ] `takeTurn` wiring tests: route to planning, a revision, an answer with no Plan
- [ ] `turn-events` gains a `plan` event; the chat shows the Idea sections, the table of lines (product, quantity, purpose, snapshot price) and the total; new step kinds have Spanish texts with tests
- [ ] The Conversation Log records every `plan` call and search
- [ ] Checked by hand in `pnpm dev` with "lasaña para 4" and one revision; screenshot in Comments
- [ ] `ARCHITECTURE.md` describes a Plan end to end and the new stage; `docs/LLM.md` documents the task, its checks and the loop
- [ ] `pnpm check` is green

## Comments
