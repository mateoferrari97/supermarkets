# 02: ADR, glossary and LLM rules for Plans

**What to build:** Record that, in a Plan, the LLM proposes products it saw in a code search and quantities valid for them; code checks both; nothing reaches the cart until the Owner confirms; a confirmed Plan Line counts as the Owner's own choice. Orders keep today's rules. Add the terms the code will use.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] New ADR in `docs/adr/` (next number, no gaps) and its line in `docs/adr/README.md`, amending ADR 0002, 0004 and 0012 by reference
- [ ] `GLOSSARY.md` gains Plan, Plan Line, Idea and Topic, with the words to avoid
- [ ] `docs/LLM.md` "The LLM translates, code decides" states the exception for Plans and links the ADR
- [ ] `pnpm check` is green

## Comments
