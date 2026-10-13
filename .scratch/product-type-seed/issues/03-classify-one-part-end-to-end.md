# 03: Classify one part end to end

**What to build:** A fresh Claude Code session runs the seed project skill on one part: it starts one classifier subagent that reads the seed rules document and the part, writes a proposal (Product Type Groups, Product Types, excluded Tipos, doubts with ranked candidates), and the coordinator validates it, re-running the subagent if it is invalid. See `.scratch/product-type-seed/spec.md` (Seed rules document, Proposal shape, Coordinator).

**Blocked by:** 01, 02

**Status:** ready-for-agent

- [ ] The seed rules document is in the repo and covers: the two-level tree, the replacement rule for merging Tipos, Groups for loose words and for concepts spanning Tipos, catch-alls kept broad, exclusion, id and name format, every Tipo exactly once, doubts instead of guesses.
- [ ] A zod schema for the proposal exists and the coordinator checks shape and completeness (every Tipo of the part appears exactly once as mapped, excluded or doubt).
- [ ] An invalid proposal makes the coordinator re-run that part's subagent.
- [ ] The project skill can be invoked from a fresh session with a part name.
- [ ] Running it on the Bebidas part produces a valid proposal.
- [ ] No code calls the Claude API.
- [ ] `pnpm check` exits 0.
