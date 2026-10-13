# 04: Classify all parts in parallel and consolidate

**What to build:** The seed project skill runs one classifier subagent per part in parallel, then consolidates every proposal into the final vocabulary and Carrefour mapping, plus a remaining-doubts file, a readable tree summary and a coverage report. It can also redo a single part. See `.scratch/product-type-seed/spec.md` (Coordinator, Remaining doubts and tree summary).

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] All parts are classified by subagents running in parallel, each validated as in 03.
- [ ] Consolidation merges Groups and Product Types that mean the same thing across parts and unifies their ids.
- [ ] Consolidation places doubts it can resolve with the whole tree in view; the rest go to the remaining-doubts file with ranked candidates, reason and examples.
- [ ] The final vocabulary and mapping are written and pass the 01 validation.
- [ ] A readable Markdown summary lists Groups, Product Types and Tipos with product counts; it and the doubts file stay out of git.
- [ ] A coverage report states Tipos mapped, excluded, in doubt and unreviewed against the Catalog Snapshot.
- [ ] Redoing a single part replaces only that part's proposal and re-runs consolidation.
- [ ] `pnpm check` exits 0.
