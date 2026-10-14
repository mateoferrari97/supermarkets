# 03: Ask about Groups and ambiguous Items and apply the answers

**What to build:** When an Item names a Product Type Group ("leche") or is ambiguous, the Order Resolution holds a question with numbered Product Type options, and every question of the order goes into one message. The Owner answers in free text; `answerQuestions` maps the answer onto the offered options, resolves those Items, keeps the rest asked, and "cualquiera" leaves the choice among the offered options to the Selection Policy. The order command becomes interactive. See `.scratch/order-resolution/spec.md` (Questions round).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] A Group answer, or an `ambiguous` answer, becomes a question listing Product Types; no excluded Tipo or unknown id appears as an option.
- [ ] All pending Items are asked in one message with numbered options, in Spanish.
- [ ] The LLM port has a task that maps a free-text answer onto the offered options only.
- [ ] `answerQuestions` resolves the Items answered, keeps resolved Items untouched, keeps the question for an answer that maps to nothing, and handles "cualquiera".
- [ ] Tested with a fake LLM through the entry points.
- [ ] The order command asks the questions on the terminal and applies the answers on real Claude Code sessions until nothing is pending.
- [ ] `pnpm check` exits 0.
