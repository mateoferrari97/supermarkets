# 05: Review the remaining doubts with the Owner

**What to build:** After consolidation, the coordinator asks the Owner the remaining doubts in numbered batches, applies answers given in plain words, and lets the Owner correct anything seen in the tree summary the same way. The review can stop and resume. See `.scratch/product-type-seed/spec.md` (User Stories 26 to 33).

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Doubts are asked in numbered batches, each with Tipo, product count, examples, ranked candidates and reason.
- [ ] Answers in plain words are applied: pick a candidate, create a new Product Type or Group, exclude the Tipo.
- [ ] A correction raised from the tree summary is applied through the same path.
- [ ] Each answered doubt is removed from the remaining-doubts file, so a later session resumes from what is left.
- [ ] After each batch the vocabulary and mapping still pass the 01 validation.
- [ ] At the end the coverage report shows no Tipo in doubt.
- [ ] `pnpm check` exits 0.
