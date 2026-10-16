# 06: Rounds of questions when nothing fits

**What to build:** When `resolveItem` finds no Fit it returns 3 Alternatives, and the agent asks with `askQuestions`: one round with every open question, numbered, each with its options and a recommended one, ending the turn. The page shows the round as a card with "Más opciones" (the next 3 not yet shown) and "Aceptar recomendadas". The Owner's reply, by tap or in words, resumes the Order.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `resolveItem` returns 3 Alternatives at a time and never repeats an excluded product (tests)
- [ ] A round is stored as a message of the Chat and survives a reload
- [ ] Every question of the turn is in one round
- [ ] `pnpm check` is green

## Comments
