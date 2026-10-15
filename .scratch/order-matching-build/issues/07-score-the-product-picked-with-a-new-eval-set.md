# 07: Score the product picked with a new eval set

**What to build:** `evals/order-matching.json` and the commands around it: `pnpm order:eval` runs each order case through call 1, `matchItems`, the size and quantity rule and the Selection Policy on snapshot prices, 3 times, and reports the metrics of the spec; `pnpm order:eval-set` validates the set in `pnpm check`; `pnpm order:label <words>` lists likely products to label a case. The old set and its code go. See the spec, "Eval set".

**Blocked by:** 05, 06

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Case shape, metrics, pass rule, `--runs N` (3 by default), stale report, `order:eval-set` checks and the list of cases rewritten, added and dropped: as the spec says. Answer cases come in ticket 09.
- Eval runs saved under `.data/order-matching/eval-runs/` with the Catalog Snapshot's date; the comparison with the previous run stays.
- Deleted: `evals/order-resolution.json`, `eval-set.ts`, `eval-run.ts` and their tests in `src/core/order-resolution/`, `src/cli/render-item.ts`, and the vocabulary check of the eval set loader.
- The labelling helper is a command, `pnpm order:label`, in `src/cli/`, reading through `compose`.

## Constraints

- Cases are labelled by a human with the helper; every `productId` in the set is checked in stock on the current snapshot when the set is written.
- No order may equal an example order of `prompts/order-matching/`.

## Acceptance

- [ ] Tests for the validation and every metric with fixed inputs (including stale ids and `expectedToFail`).
- [ ] `pnpm order:eval` run once over the whole set; run file, pass count, wrong picks nobody sees, Fits precision and recall, Matches recall, stability, time and cost noted under Comments, with the four failing Items of the baseline called out.
- [ ] `CLAUDE.md` Commands, `ARCHITECTURE.md` Data table, `docs/LLM.md` and `docs/TESTING.md` describe the new set, its commands and metrics.
- [ ] `pnpm check` exits 0 (it runs `pnpm order:eval-set`).

## Comments
