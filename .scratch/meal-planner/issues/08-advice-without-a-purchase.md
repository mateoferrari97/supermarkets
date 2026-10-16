# 08: Advice without a purchase

**What to build:** "¿Qué vino va con pescado?" is routed to `plan` and gets an answer with no Plan; the conversation stays in `planning`. If the Owner then wants to buy ("dale, comprame uno"), the planner searches and shows a Plan, which can be confirmed as any other.

**Blocked by:** 04

**Status:** resolved

- [x] `prompts/planning/plan.md` gains the advice example, with and without the follow-up purchase
- [x] `takeTurn` tests: advice with no Plan stays in `planning`; a later message gets a Plan
- [x] Checked by hand in `pnpm dev` with the wine question and a follow-up purchase; screenshot in Comments
- [x] `pnpm check` is green

## Comments

- No code change in `takeTurn` was needed: ticket 04 already keeps an answer with no Plan in `planning` and sends the next message to `plan`. Two new tests in `src/core/order-conversation/take-turn.test.ts` (`planning > advice`) pin it: advice answered with no Plan stays in `planning` with no last Plan, and "dale, comprame uno" then sends the whole conversation to `plan`, runs a search and shows a Plan. Breaking `planningTurn` so the planner's message is not kept fails the second test.
- `prompts/planning/plan.md` gains a rule for advice (answer with no search and no Plan unless the Owner asks to buy; when they do, search and answer with a Plan whose Idea holds the advice) and three examples: the advice, the search after "dale, comprame uno" and the Plan. `ARCHITECTURE.md` and `docs/LLM.md` mention advice as an answer with no Plan.
- Hand check in `pnpm dev` on port 3800, postal code 1425. "¿qué vino va con pescado?" ran "Entendiendo tu mensaje" and one "Armando el plan" with no search, and got an answer with no Plan; the chat stayed open. "dale, comprame uno" ran one search round ("vino blanco sauvignon blanc", "vino blanco torrontés") and showed the Plan "Vino para pescado" with a "Consejo" section and one line, Vino blanco Sauvignon Blanc Santa Julia 750 ml, total $ 6.849,00. The advice answer repeated the prompt example word for word, which fits the question but shows the example steers the wording. Screenshots: [08-wine-advice-no-plan.png](../screenshots/08-wine-advice-no-plan.png), [08-wine-follow-up-plan.png](../screenshots/08-wine-follow-up-plan.png). Confirming the Plan is ticket 05 and was not checked here.
- `.data` is a symlink to the main checkout's data folder, so the hand check wrote its Conversation Log into that folder's `conversations/`.
