# 08: Advice without a purchase

**What to build:** "¿Qué vino va con pescado?" is routed to `plan` and gets an answer with no Plan; the conversation stays in `planning`. If the Owner then wants to buy ("dale, comprame uno"), the planner searches and shows a Plan, which can be confirmed as any other.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `prompts/planning/plan.md` gains the advice example, with and without the follow-up purchase
- [ ] `takeTurn` tests: advice with no Plan stays in `planning`; a later message gets a Plan
- [ ] Checked by hand in `pnpm dev` with the wine question and a follow-up purchase; screenshot in Comments
- [ ] `pnpm check` is green

## Comments
