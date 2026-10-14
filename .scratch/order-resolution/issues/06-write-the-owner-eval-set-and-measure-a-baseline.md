# 06: Write the Owner's eval set and measure a baseline

**What to build:** The Owner writes 30 to 50 real order phrases with their expected outcome, runs the eval set on Claude Code sessions, and records the baseline: hits, the misses worth fixing, time and cost per run. See `.scratch/order-resolution/spec.md` (Eval set).

**Blocked by:** 02, 03, 04, 05

**Status:** ready-for-human

- [ ] The eval set holds 30 to 50 cases written by the Owner, covering clear Items, Groups, ambiguous Items, brands, quantities, terms, vague words and exclusions.
- [ ] A full run on Claude Code sessions is saved and its hit rate, time and cost are recorded in this ticket.
- [ ] The misses are listed with a decision for each: fix the prompt, fix the tree, or accept.
- [ ] `pnpm check` exits 0.
