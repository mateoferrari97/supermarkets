---
name: review-product-type-doubts
description: Ask the Owner the remaining Product Type seed doubts in numbered batches and apply their plain-word answers, plus any correction they raise from the tree summary.
disable-model-invocation: true
---

You review the remaining doubts of the Product Type seed with the Owner. Talk to the Owner in Spanish. Arguments: an optional batch size (default 10).

## Steps

1. **Start.** Run `pnpm seed:consolidate` and `pnpm seed:coverage`. If consolidation fails, stop and report its errors. If there are no doubts, report the coverage and stop. Tell the Owner how many doubts remain and that `.data/carrefour/seed/summary.md` holds the whole tree if they want to skim it.
2. **Ask a batch.** Run `pnpm seed:doubts <size>`. Show the batch to the Owner in Spanish, keeping the numbers and letters: for each doubt the Tipo, product count, reason, examples and the lettered candidates. Explain once how to answer: "3b", "la 2 es la a", "excluí la 5", "la 7 va a un nuevo tipo X en el grupo Y", "saltear la 4". Wait for the answer.
3. **Apply.** Turn each answer into decisions and append them to `.data/carrefour/seed/decisions.json` (format: section "Decisions" of `.claude/skills/seed-product-types/SKILL.md`):
   - A candidate letter: `place` the Tipo in that Product Type id.
   - Exclude: `exclude` with a short Spanish reason taken from the Owner's words or the doubt.
   - A new Product Type: `addProductType` (id: the name as a lowercase ASCII hyphenated slug), preceded by `addGroup` when the Owner names a Group that does not exist (id `grupo-<slug>`); then `place`.
   - Skipped or unclear: no decision; ask again in the next batch or right away if unclear.
   Then run `pnpm seed:consolidate` and `pnpm product-types`. If either fails, fix the decisions you just added and run again before going on.
4. **Corrections from the summary.** When the Owner points at something in the tree summary (a Tipo in the wrong Product Type, two Product Types that should be one, a wrong name or Group), apply it the same way with `place`, `exclude`, `merge`, `move` or `rename`, then run step 3's commands.
5. **Next.** Report what was applied (one line per answer) and the doubts left, then go back to step 2. The Owner may stop at any time: everything applied is already in `decisions.json`, and a later session resumes from the doubts that remain.
6. **Finish.** When no doubts remain, run `pnpm seed:coverage` and `pnpm check` and report them. Do not commit unless the Owner asks.
