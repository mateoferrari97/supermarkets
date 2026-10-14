# 06: Write the Owner's eval set and measure a baseline

**What to build:** The Owner writes 30 to 50 real order phrases with their expected outcome, runs the eval set on Claude Code sessions, and records the baseline: hits, the misses worth fixing, time and cost per run. See `.scratch/order-resolution/spec.md` (Eval set).

**Blocked by:** 02, 03, 04, 05

**Status:** wontfix

- [ ] The eval set holds 30 to 50 cases written by the Owner, covering clear Items, Groups, ambiguous Items, brands, quantities, terms, vague words and exclusions.
- [ ] A full run on Claude Code sessions is saved and its hit rate, time and cost are recorded in this ticket.
- [ ] The misses are listed with a decision for each: fix the prompt, fix the tree, or accept.
- [ ] `pnpm check` exits 0.

## Comments

The Owner decided on 2026-10-13 not to write the larger eval set or measure a baseline for now. The starter set of 11 cases in `evals/order-resolution.json` stays (10/11 hits on 2026-10-13, the miss being the expected `conos-de-queso`). Two known misses remain undecided: `conos-de-queso` does not resolve to the broad `snacks` Product Type, and "leche descremada La Serenísima" is sometimes split as "leche" with the term "descremada".
