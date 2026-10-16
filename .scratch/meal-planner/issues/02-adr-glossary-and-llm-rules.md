# 02: ADR, glossary and LLM rules for Plans

**What to build:** Record that, in a Plan, the LLM proposes products it saw in a code search and quantities valid for them; code checks both; nothing reaches the cart until the Owner confirms; a confirmed Plan Line counts as the Owner's own choice. Orders keep today's rules. Add the terms the code will use.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] New ADR in `docs/adr/` (next number, no gaps) and its line in `docs/adr/README.md`, amending ADR 0002, 0004 and 0012 by reference
- [x] `GLOSSARY.md` gains Plan, Plan Line, Idea and Topic, with the words to avoid
- [x] `docs/LLM.md` "The LLM translates, code decides" states the exception for Plans and links the ADR
- [x] `pnpm check` is green

## Comments

- ADR 0013 (`docs/adr/0013-in-a-plan-the-llm-proposes-seen-products-and-the-owner-confirms.md`) records the Plan rules and amends ADR 0002 (as restated by ADR 0011), ADR 0004 and ADR 0012 by reference. Each amended ADR gains one pointer paragraph to ADR 0013, as ADR 0004 already does for ADR 0012; their text is not rewritten.
- `GLOSSARY.md` gains Topic, Plan, Plan Line and Idea under Conversation, each with words to avoid ("shopping list", "recipe list", "suggestion" among them).
- `docs/LLM.md` "The LLM translates, code decides" states the Plan exception and links ADR 0013.
- Docs-only ticket: no code, so no tests and no hand check in `pnpm dev`. `pnpm check` exits 0 (396 tests pass, docs check clean).
