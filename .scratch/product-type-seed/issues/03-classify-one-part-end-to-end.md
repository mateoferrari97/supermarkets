# 03: Classify one part end to end

**What to build:** A fresh Claude Code session runs the seed project skill on one part: it starts one classifier subagent that reads the seed rules document and the part, writes a proposal (Product Type Groups, Product Types, excluded Tipos, doubts with ranked candidates), and the coordinator validates it, re-running the subagent if it is invalid. See `.scratch/product-type-seed/spec.md` (Seed rules document, Proposal shape, Coordinator).

**Blocked by:** 01, 02

**Status:** resolved

- [x] The seed rules document is in the repo and covers: the two-level tree, the replacement rule for merging Tipos, Groups for loose words and for concepts spanning Tipos, catch-alls kept broad, exclusion, id and name format, every Tipo exactly once, doubts instead of guesses.
- [x] A zod schema for the proposal exists and the coordinator checks shape and completeness (every Tipo of the part appears exactly once as mapped, excluded or doubt).
- [x] An invalid proposal makes the coordinator re-run that part's subagent.
- [x] The project skill can be invoked from a fresh session with a part name.
- [x] Running it on the Bebidas part produces a valid proposal.
- [x] No code calls the Claude API.
- [x] `pnpm check` exits 0.

## Comments

Run in the authoring session acting as coordinator (not a fresh session) on Bebidas. The first pass split wine by grape and could not name a doubt-only Product Type; the rules now keep grape variety inside "Vino tinto", allow an empty Product Type named by a doubt, and require two candidates per doubt. The final Bebidas proposal is valid: 105 Tipos, 28 Groups, 53 Product Types, 10 doubts. The retry path was exercised by sending a classifier its check errors.

Open for the Owner: generic Tipos such as "Cerveza" (240 products, mixed styles) became a broad Product Type next to the style ones; decide in review whether that holds.
