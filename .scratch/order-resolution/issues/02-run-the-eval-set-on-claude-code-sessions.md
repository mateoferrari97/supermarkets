# 02: Run the eval set on Claude Code sessions

**What to build:** The Owner keeps an eval set of order phrases with their expected outcome and runs it with one command on real Claude Code sessions, getting hits, misses with what came back, errors, time and cost; each run is saved with its date. See `.scratch/order-resolution/spec.md` (Eval set).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The eval set is a committed file of cases: order text and expected outcome per Item (Product Type id, a question whose options include given ids or a Group, or no Item; optionally quantity, terms, brand).
- [ ] `pnpm check` validates the eval set's shape and that every expected id exists in the vocabulary, without running any LLM.
- [ ] One command runs every case, or the cases matching a filter, through `resolveOrder` with the Claude Code session adapter.
- [ ] The report lists hits, misses with the actual output, errors, total time and total cost.
- [ ] Each run is written with its date under the git-ignored data folder, so two runs can be compared.
- [ ] A starter set of about 10 cases from the ADR examples (leche, Cindor, dos cocas grandes, nada de huevos, conos de queso, medio sachet de leche) is committed for the Owner to extend; cases that need later tickets are marked as expected to fail until then.
- [ ] `pnpm check` exits 0.
