# 06: Events and weekly menus: budget and shared ingredients

**What to build:** "Un asado para 10 con unos $50.000" gets a Plan with amounts per person that fits the budget, and "las comidas de la semana sin TACC, ya tengo aceite y sal" gets a menu per day where an ingredient used in several dishes is one line with the summed quantity, nothing with gluten and no oil or salt. The `answer` output gains `budget | null`. Code merges lines with the same product (summed quantity, purposes joined) before the total. When the total exceeds the budget, code calls `plan` once more with the difference; a Plan still over budget is shown with a line saying by how much.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Merging, the over-budget retry and the over-budget amount as plain data tests
- [ ] `Reply` `plan` carries the over-budget amount; the chat shows the over-budget line
- [ ] `prompts/planning/plan.md` gains examples for an event with a budget, a weekly menu, a diet or allergy, and what the Owner already has
- [ ] Checked by hand in `pnpm dev` with the asado and the weekly menu; screenshots in Comments
- [ ] `docs/LLM.md` documents the merge and the budget retry
- [ ] `pnpm check` is green

## Comments
