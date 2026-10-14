# 02: Run the eval set on Claude Code sessions

**What to build:** The Owner keeps an eval set of order phrases with their expected outcome and runs it with one command on real Claude Code sessions, getting hits, misses with what came back, errors, time and cost; each run is saved with its date. See `.scratch/order-resolution/spec.md` (Eval set).

**Blocked by:** 01

**Status:** resolved

- [x] The eval set is a committed file of cases: order text and expected outcome per Item (Product Type id, a question whose options include given ids or a Group, or no Item; optionally quantity, terms, brand).
- [x] `pnpm check` validates the eval set's shape and that every expected id exists in the vocabulary, without running any LLM.
- [x] One command runs every case, or the cases matching a filter, through `resolveOrder` with the Claude Code session adapter.
- [x] The report lists hits, misses with the actual output, errors, total time and total cost.
- [x] Each run is written with its date under the git-ignored data folder, so two runs can be compared.
- [x] A starter set of about 10 cases from the ADR examples (leche, Cindor, dos cocas grandes, nada de huevos, conos de queso, medio sachet de leche) is committed for the Owner to extend; cases that need later tickets are marked as expected to fail until then.
- [x] `pnpm check` exits 0.

## Comments

The eval set is `evals/order-resolution.json`. Each case has an `id`, the `order` text, the expected `items` and an optional `expectedToFail` reason. An expected Item is one of `{ "productType": id }`, `{ "question": { "group": id, "includes": [ids] } }` (a pending Item whose candidates contain the Group's Product Types and the given ids) or `{ "noItem": word }` (no Item phrase contains the word); the first two take optional `quantity`, `brand` and `terms`. A case hits when the Items match the expectations one to one, with no extra Items; brand and terms compare ignoring case, accents and punctuation, and expected terms must be among the returned ones. `pnpm order:eval-set` validates the shape and the ids against the vocabulary and runs in `pnpm check`.

`pnpm order:eval [filter...]` runs the cases whose id or order text contains any filter, prints hits, misses with what came back, errors, sessions, time and cost, the outcome changes since the latest saved run, and writes the run to `.data/order-resolution/eval-runs/<date>.json`. It exits 1 on a miss or error not marked as expected to fail.

The starter set has 11 cases. Only `conos-de-queso` is marked as expected to fail (the Snack salado Group comes back instead of `snacks`), for ticket 06 to decide. The other cases check what `resolveOrder` returns today and need no later ticket to pass; once ticket 05 turns vague words and unmatched terms into questions, `productType` expectations, which now require a resolved Item, must also accept an Item whose Product Type is set but still has a size or term question.

Real runs on 2026-10-13:
- Full set: 9/11 hits, 24 sessions, 82.1 s, US$ 0.0094. Misses: `conos-de-queso` (expected) and `leche-descremada-with-brand`, split as phrase "leche" with term "descremada" and so resolved to `grupo-leche`.
- `descremada cindor` filter, right after: 2/2 hits, so the split of "leche descremada La Serenísima" differs between runs; the split prompt's "descremada only if it is not already in the phrase" example is a candidate fix for ticket 06.
