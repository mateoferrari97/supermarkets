# 09: Eval set and commands for routing and planning

**What to build:** `evals/planning.json` with routing cases (a message and its Topic) and plan cases (a first message, scored on the first Plan shown after its search rounds). Code scores: Topic; every line in stock in the Catalog Snapshot; total within the budget; quantity ranges for named products; forbidden products or words (diet, what the Owner has); one line per product; Idea sections of the right kind. An LLM judge with a fixed rubric scores whether the Idea is sensible, reported apart and never failing the run. Cases cover the eight cases of the spec. `pnpm plan:eval [filter...] [--runs N]` runs it with real sessions; `pnpm plan:eval-set` validates the data and joins `pnpm check`.

**Blocked by:** 03, 05, 06, 07, 08

**Status:** ready-for-agent

- [ ] Eval set schema and loader in core, loaded through `src/compose.ts`
- [ ] At least 15 routing cases and 12 plan cases, at least one per case of the spec, labelled with `pnpm order:label`
- [ ] Scoring tests over fixed inputs
- [ ] Both commands in `src/cli/`, `package.json` and the Commands of `CLAUDE.md`; `pnpm plan:eval-set` in `pnpm check`
- [ ] One full `pnpm plan:eval` run recorded in Comments with time and cost per case
- [ ] `docs/LLM.md` and `docs/TESTING.md` describe the eval set
- [ ] `pnpm check` is green

## Comments
