# 04: Reword Items with no match, then ask what the Owner means

**What to build:** An Item the LLM answers `none` for is reworded once by the LLM and resolved again; if it still has no match it becomes the question "¿a qué te referís?" in the order's questions message, and the Owner's free-text answer is resolved as a new phrase. See `.scratch/order-resolution/spec.md` (Resolving an Item).

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] The LLM port has a task that rewords an Item with no match.
- [ ] A `none` answer triggers exactly one rewording and one more resolution.
- [ ] A second `none` becomes "¿a qué te referís?"; the Owner's answer to it is resolved like a new Item phrase.
- [ ] Tested with a fake LLM through the entry points.
- [ ] `pnpm check` exits 0.
