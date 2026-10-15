# 08: New eval set

Type: grilling
Status: resolved
Blocked by: 02, 05

## Question

What does an eval case look like in the new flow (the order, the expected Items, the acceptable products per Item), which metrics does `pnpm order:eval` report (Items read right, Matches recall, Fits precision and recall, wrong picks nobody sees, question rate, stability between runs), and what does `pnpm order:eval-set` validate in `pnpm check`? How are the current cases in `evals/order-resolution.json` migrated or dropped?

## Comments

- From [Baseline of the current flow](01-baseline-of-the-current-flow.md): the current eval set passes 13/14 while the four Items of the 2026-10-15 Conversation Log all fail, because it never scores the product. The four Items (carbón, Port Salut light, coca zero grande, coca normal chica) should be cases of the new set, so the new flow is compared against the current one on them.
- From [Prototype the two calls](02-prototype-the-two-calls.md): call 2 changed its Fits between two runs of the same order (flavoured provoletas, pork picaña), so each case needs several runs and a stability metric. The call 1 example is almost the Conversation Log order; cases must not repeat prompt examples.
- From [Questions and answers in the new flow](05-questions-and-answers.md): an answer is its own call 1 shape (one entry per question: `choice`, `lines`, `drop`, `unanswered`, plus `newLines`), and call 2 returns up to 5 `closest` Alternatives when no Match fits. Cases for answers (pick by number, new brand, "sacala", an ignored question, a reply that adds a thing) and a check that Alternatives are alike belong in the set.
- From [Payment Card and preference](06-payment-card-and-preference.md): call 1 has a boolean `ignoredPreference`; cases with a card or a preference ("pago con Visa", "nada de Marolio") check it is set and that no Item comes from those words.
- From [Fate of Product Types and the seed](07-fate-of-product-types-and-the-seed.md): Product Types are deleted, so cases and `pnpm order:eval-set` cannot refer to them; the current validation against the Product Type tree in `eval-set.ts` goes away.

## Answer

Agreed with the Owner on 2026-10-15.

- **A case runs the flow up to the pick**: call 1, search, call 2, size rule and Selection Policy, with Catalog Snapshot prices. No live checkout simulation: Branch stock and promotions change and would make the eval unstable.
- **Acceptable products are `productId` lists per Item**: `fits` holds every in-stock catalog product that fits; any Match outside it counts as not a Fit. An optional `pick` (a subset of `fits`) narrows the right pick when size matters ("grande" is only the 2,25 l). An Item that must ask instead carries `alternatives`, the acceptable Alternatives. A helper script lists likely products from the Catalog Snapshot per Item so a human can label them; it ships with the eval set.
- **The Catalog Snapshot is not pinned**: the eval runs against the current one and saves its date in the run file. An expected `productId` missing or out of stock is reported as stale, not as a failure, so it gets relabelled.
- **Metrics per run**: Items read right (`brand`, `size.kind`, `quantity`, number of Items, things that must not be Items; `product` is not compared as text), Matches recall (expected Fits among the Matches), Fits precision and recall, pick right (pick in `pick`, or in `fits` when there is no `pick`), wrong picks nobody sees (wrong pick with no note and no question; the headline number), question rate (asked when it should not, or did not ask when it should), Alternatives in `alternatives`, `ignoredPreference` when expected, stability (same Fits and same pick across runs), and sessions, time and cost.
- **Pass and exit code**: a case passes when, in every run, each Item has a right pick or the expected question. `pnpm order:eval` exits 1 when a case not marked `expectedToFail` fails. Recall, precision and stability are reported as numbers with no threshold yet.
- **Runs per case**: 3 by default, `--runs N` to change it.
- **Answer cases are their own shape, one turn**: fixed open questions (the Item's `original`, the text, the Alternatives by `productId`) and the Owner's reply. The eval runs only call 1 in answer mode and compares each entry's kind (`choice` with its number, `lines` with product and brand, `drop`, `unanswered`) and `newLines`. Cases: "la 2", "dale, una Patagonia", "sacala", an ignored question, "agregá un vino tinto".
- **Migration**: `evals/order-resolution.json` is deleted and replaced by `evals/order-matching.json`; the commands keep their names `order:eval` and `order:eval-set`. Rewritten as new cases: `nada-de-huevos`, `envio-a-codigo-postal`, `marca-de-una-lista`, `marca-con-tambien`, `coca-de-2-25`, `leche-descremada-with-brand`, `un-par-de-yogures`, `medio-sachet-de-leche`, `dos-cocas-grandes`. Added: the four failing Items of the Conversation Log as short orders that do not copy the call 1 example, the unseen order of the prototype, and orders with a card or a preference ("pago con Visa", "nada de Marolio") expecting `ignoredPreference`. Dropped, because they test Groups: `leche-is-a-group`, `cindor-brand-only`, `conos-de-queso`.
- **`pnpm order:eval-set` validates** the shape with zod, unique case ids, non-empty `productId`s with no repeats inside an Item, `pick` within `fits`, `alternatives` only on Items with no `fits`, and that no order equals an example order in `prompts/`. It never reads the Catalog Snapshot, so it passes in `pnpm check` without `.data/`.
- **Baseline**: the old flow is not rerun on the new set; the comparison is against the record of [Baseline of the current flow](01-baseline-of-the-current-flow.md) (0/4 failing Items reaching a cart).
