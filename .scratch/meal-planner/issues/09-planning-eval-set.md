# 09: Eval set and commands for routing and planning

**What to build:** `evals/planning.json` with routing cases (a message and its Topic) and plan cases (a first message, scored on the first Plan shown after its search rounds). Code scores: Topic; every line in stock in the Catalog Snapshot; total within the budget; quantity ranges for named products; forbidden products or words (diet, what the Owner has); one line per product; Idea sections of the right kind. An LLM judge with a fixed rubric scores whether the Idea is sensible, reported apart and never failing the run. Cases cover the eight cases of the spec. `pnpm plan:eval [filter...] [--runs N]` runs it with real sessions; `pnpm plan:eval-set` validates the data and joins `pnpm check`.

**Blocked by:** 03, 05, 06, 07, 08

**Status:** resolved

- [x] Eval set schema and loader in core, loaded through `src/compose.ts`
- [x] At least 15 routing cases and 12 plan cases, at least one per case of the spec, labelled with `pnpm order:label`
- [x] Scoring tests over fixed inputs
- [x] Both commands in `src/cli/`, `package.json` and the Commands of `CLAUDE.md`; `pnpm plan:eval-set` in `pnpm check`
- [x] One full `pnpm plan:eval` run recorded in Comments with time and cost per case
- [x] `docs/LLM.md` and `docs/TESTING.md` describe the eval set
- [x] `pnpm check` is green

## Comments

### Implementation

- Schema and loader: `src/core/planning/eval-set.ts` (`validatePlanningEvalSet`, which also checks that every case of the spec is covered and that no message is an example of `prompts/`), loaded by `loadPlanningEvalSet` in `src/adapters/files/data-files.ts` and exposed through `src/compose.ts`.
- Scoring: `src/core/planning/eval-score.ts` (`scoreRoute`, `scorePlanRun`, `summarizePlanning`), with tests over fixed inputs in `eval-score.test.ts`. "One line per product" is scored on the Plan the planner answered, before code merges its lines, since the Plan shown is always merged.
- Run of a plan case: `planFirstMessage` in `src/core/planning/eval-run.ts` sends the message through `planWithinBudget` (the chat's search loop and budget retry) and records the Plan shown, the budget, what it is still over and the queries of each round.
- Judge: the `judge-idea` session (`prompts/planning/judge-idea.md`, `claude-sonnet-5-5` at its default effort) through `createClaudeCodeIdeaJudge` in the Claude Code adapter; reported apart and never failing a run.
- Commands: `pnpm plan:eval [filter...] [--runs N]` (`src/cli/plan-eval.ts`, report in `src/cli/plan-eval-report.ts`) and `pnpm plan:eval-set` (`src/cli/plan-eval-set.ts`), in `package.json`, the Commands of `CLAUDE.md` and `pnpm check`. Runs are saved in `.data/planning/eval-runs/`.
- `evals/planning.json`: 15 routing cases (5 per Topic) and 14 plan cases covering the 8 cases of the spec. Quantity ranges (lentejas, pollo, the meat of the asado) were labelled with `pnpm order:label`; every `productId` was in stock in the Catalog Snapshot of 2026-10-15T20:44:49Z.
- Docs: `docs/LLM.md` (new section "The planning eval set", Prompts, Changing a prompt), `docs/TESTING.md`, `ARCHITECTURE.md`.
- No hand check in `pnpm dev`: this ticket adds no chat behaviour.

### Full run

`pnpm plan:eval`, 3 runs per case, started 2026-10-16T19:07:20Z on the Catalog Snapshot of 2026-10-15T20:44:49Z. Total: 133 sessions, 668.0 s, $1.3207 (judge sessions included in the total, not in the per-case cost). Models: `route-message` on `claude-haiku-5-5`, `plan` and `judge-idea` on `claude-sonnet-5-5`.

- Routing cases passed: 15/15.
- Plan cases passed: 6/14. Every failure is one error: the planner asked for 9 to 12 queries in one search, and `checkPlan` rejects more than 8 (16 of 42 plan runs). No run that answered broke a scored rule (stock, budget, ranges, forbidden products or words, one line per product, Idea sections).
- Ideas judged sensible: 26/26 of the runs that answered.
- Finding for a later ticket: `prompts/planning/plan.md` says "1 to 8 queries" but the planner asks for every ingredient at once and goes over it; either the prompt or the limit has to change. The eval set does not mark these cases `expectedToFail`, so `pnpm plan:eval` exits 1 until then.
- The report printed float totals unrounded (`$13303.109999999999`); fixed after the run to round to cents.

Time and cost per case (time and cost per run are averages of the 3 runs; routing has one session per run):

| Case | Passed | Sessions | Time per run | Cost per run | Cost |
| --- | --- | --- | --- | --- | --- |
| route-order-list | yes | - | 3.3 s | $0.0001 | $0.0003 |
| route-order-brands | yes | - | 2.6 s | $0.0001 | $0.0003 |
| route-order-greeting | yes | - | 2.8 s | $0.0001 | $0.0003 |
| route-order-purpose | yes | - | 3.1 s | $0.0001 | $0.0003 |
| route-order-cleaning | yes | - | 2.9 s | $0.0001 | $0.0003 |
| route-plan-recipe | yes | - | 2.8 s | $0.0001 | $0.0003 |
| route-plan-event | yes | - | 3.0 s | $0.0001 | $0.0003 |
| route-plan-menu | yes | - | 2.7 s | $0.0001 | $0.0003 |
| route-plan-gift | yes | - | 3.1 s | $0.0001 | $0.0002 |
| route-plan-advice | yes | - | 2.9 s | $0.0001 | $0.0003 |
| route-off-topic-weather | yes | - | 2.9 s | $0.0001 | $0.0003 |
| route-off-topic-greeting | yes | - | 2.7 s | $0.0001 | $0.0003 |
| route-off-topic-football | yes | - | 2.4 s | $0.0001 | $0.0003 |
| route-off-topic-homework | yes | - | 2.8 s | $0.0001 | $0.0003 |
| route-off-topic-joke | yes | - | 3.2 s | $0.0001 | $0.0003 |
| plan-recipe-lentil-stew | no | 3 | 3.6 s | $0.0031 | $0.0094 |
| plan-recipe-ham-cheese-pie | yes | 6 | 15.0 s | $0.0472 | $0.1416 |
| plan-recipe-pizza-already-have | yes | 6 | 13.0 s | $0.0407 | $0.1222 |
| plan-recipe-rice-chicken-already-have | no | 4 | 7.1 s | $0.0223 | $0.0669 |
| plan-event-asado | no | 4 | 8.1 s | $0.0231 | $0.0692 |
| plan-event-birthday | no | 4 | 10.9 s | $0.0289 | $0.0867 |
| plan-event-picada | no | 3 | 4.0 s | $0.0040 | $0.0121 |
| plan-weekly-menu-gluten-free | no | 5 | 14.3 s | $0.0327 | $0.0981 |
| plan-weekly-menu-vegetarian | no | 5 | 15.7 s | $0.0471 | $0.1414 |
| plan-gift-mate | yes | 6 | 11.8 s | $0.0379 | $0.1138 |
| plan-gift-niece | yes | 6 | 12.5 s | $0.0521 | $0.1564 |
| plan-advice-fondue | yes | 3 | 6.1 s | $0.0052 | $0.0156 |
| plan-advice-steak-side | yes | 3 | 4.8 s | $0.0052 | $0.0155 |
| plan-allergy-egg-cake | no | 4 | 9.4 s | $0.0233 | $0.0700 |
