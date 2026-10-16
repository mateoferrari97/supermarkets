# 10: Agent eval set

**What to build:** An eval set of scripted Owner messages over a given Chat, Profile and past Orders, scored by code on the tool calls (postal code not asked when known, `askQuestions` only after no Fit, `buildCart` only after a proposal, past Order used when asked) and on the products of the cart. A runner command uses real sessions with a runs option; a validator joins `pnpm check`.

**Blocked by:** 05, 06

**Status:** ready-for-agent

- [ ] Cases cover the user stories of the spec
- [ ] The validator is in `pnpm check` and the runner in the Commands of `CLAUDE.md`
- [ ] `docs/LLM.md` and `docs/TESTING.md` describe the eval set
- [ ] A full run is recorded in this ticket's Comments

## Comments
