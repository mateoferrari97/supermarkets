# 05: Review the remaining doubts with the Owner

**What to build:** After consolidation, the coordinator asks the Owner the remaining doubts in numbered batches, applies answers given in plain words, and lets the Owner correct anything seen in the tree summary the same way. The review can stop and resume. See `.scratch/product-type-seed/spec.md` (User Stories 26 to 33).

**Blocked by:** 04

**Status:** resolved

- [x] Doubts are asked in numbered batches, each with Tipo, product count, examples, ranked candidates and reason.
- [x] Answers in plain words are applied: pick a candidate, create a new Product Type or Group, exclude the Tipo.
- [x] A correction raised from the tree summary is applied through the same path.
- [x] Each answered doubt is removed from the remaining-doubts file, so a later session resumes from what is left.
- [x] After each batch the vocabulary and mapping still pass the 01 validation.
- [x] At the end the coverage report shows no Tipo in doubt.
- [x] `pnpm check` exits 0.

## Comments

`pnpm seed:doubts [n]` prints a numbered batch of remaining doubts, most products first, with lettered candidates; the `review-product-type-doubts` skill applies the Owner's answers as decisions and re-runs consolidation, so the review resumes from whatever doubts remain.

The Owner found the tree too fine-grained, so before answering doubts five sequential reviewer subagents merged Product Types an Owner would accept as swaps (rules updated: lean towards merging). Each pass audited the earlier ones and could drop their operations; one over-merge (paté de atún into paté de foie) was undone. Product Types went from 1,274 to 1,020 and doubts from 104 to 83. The last pass wrote a plain-language recommendation per doubt.

The Owner then accepted the recommended option for every doubt, except Bondiola, Choclo and Perejil, whose two candidates were merged into one Product Type. Suprema de pollo kept its recommendation (Milanesa de pollo) instead of a merge, because merging would have joined all breaded chicken with raw breast. Result: 475 Groups, 1,030 Product Types; coverage 2,139 mapped, 64 excluded, 0 in doubt, 0 unreviewed.
