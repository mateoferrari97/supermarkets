# 04: Classify all parts in parallel and consolidate

**What to build:** The seed project skill runs one classifier subagent per part in parallel, then consolidates every proposal into the final vocabulary and Carrefour mapping, plus a remaining-doubts file, a readable tree summary and a coverage report. It can also redo a single part. See `.scratch/product-type-seed/spec.md` (Coordinator, Remaining doubts and tree summary).

**Blocked by:** 03

**Status:** resolved

- [x] All parts are classified by subagents running in parallel, each validated as in 03.
- [x] Consolidation merges Groups and Product Types that mean the same thing across parts and unifies their ids.
- [x] Consolidation places doubts it can resolve with the whole tree in view; the rest go to the remaining-doubts file with ranked candidates, reason and examples.
- [x] The final vocabulary and mapping are written and pass the 01 validation.
- [x] A readable Markdown summary lists Groups, Product Types and Tipos with product counts; it and the doubts file stay out of git.
- [x] A coverage report states Tipos mapped, excluded, in doubt and unreviewed against the Catalog Snapshot.
- [x] Redoing a single part replaces only that part's proposal and re-runs consolidation.
- [x] `pnpm check` exits 0.

## Comments

Consolidation is code plus coordinator decisions. `pnpm seed:consolidate` joins every valid proposal (same id across parts merges by itself) and applies `.data/carrefour/seed/decisions.json`, an ordered list of `merge`, `move`, `rename`, `addGroup`, `addProductType`, `place` and `exclude` operations. Redoing a part overwrites only its proposal; the same decisions are applied again. Ticket 05 can record the Owner's answers as further decisions. `pnpm seed:coverage` reports coverage against the Catalog Snapshot.

Run on the 2026-10-13 snapshot: the 13 remaining parts were classified in parallel, each valid on the first check. Consolidation took 110 decisions (95 merges, moves and renames; 14 doubts placed; 1 exclusion). Result: 490 Groups, 1,282 Product Types; coverage 2,011 mapped, 56 excluded, 136 in doubt, 0 unreviewed.

Open for the Owner (ticket 05):
- "Cerveza" and other generic Tipos stay as broad Product Types.
- Insecticides are kept as purchases although the rules exclude pest poison.
- "Paleta" (carnes) mixes raw beef and cooked paleta; after merging, its only candidate is `paleta` (Paleta cocida), so the answer may need a new Product Type for raw paleta.
- Many single-Product-Type Groups remain where parts did not share a loose word (for example the "Salsa" family was merged, the cheese and cut-of-meat ones were not).

Review pass: an independent reviewer subagent checked the tree and another checked the code.
- Code fixes: separate alias maps for Group and Product Type ids, with an error when one id is both; one group state per Product Type, so a move followed by a merge no longer hides a Group conflict; renaming a merged-away id fails; `excluded` is reserved; `seed:consolidate` refuses a partial tree unless `--partial`; warnings for decisions that override a confident placement, doubts left with fewer than two candidates and ids named differently by two parts; coverage label "In the mapping but not in the Catalog Snapshot".
- Tree: 74 of the reviewer's 81 operations applied (the 7 moves of special breads into `grupo-pan` were left out so "pan" does not become a 17-way question); the two coordinator placements of "Bizcochuelo" and "Bizcochuelo chocolate" were withdrawn and are doubts again. Raw beef "Paleta" now maps to the new `paleta-vacuna`.
- Rules: household insecticides and repellents stay; marketplace appliances and spare parts are excluded.
- Result: 484 Groups, 1,274 Product Types; coverage 2,037 mapped, 62 excluded, 104 in doubt, 0 unreviewed.
