# 09: Write the ADR, spec and build tickets

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 08, 10, 11, 12, 13, 14, 15

## Question

Write the ADR for the new flow (superseding ADR 0003 and amending ADRs 0002, 0004 and 0005) and add it to the index, and write `.scratch/order-matching-build/spec.md` with one `ready-for-agent` ticket per build slice in its `issues/`, so execution can start with nothing left to decide.

## Comments

- From [Payment Card and preference](06-payment-card-and-preference.md): the Payment Card and the preference are removed from the current flow before the build, with ADR 0011 superseding ADR 0002. The new ADR no longer amends ADR 0002, and the spec has no Payment Card or preference slice.
- From [Fate of Product Types and the seed](07-fate-of-product-types-and-the-seed.md): the new ADR also supersedes ADR 0001. The spec opens with a slice that deletes the seed (and `tipos.json` of `carrefour:catalog`) and closes with a slice that deletes the vocabulary, `src/core/product-types/`, the `product-types` command and the Product Type glossary terms, together with the old flow; see the answer for the file lists.
- From [New eval set](08-new-eval-set.md): the spec needs a slice for the new eval set (`evals/order-matching.json`, the case and answer-case shapes, the labelling helper, the metrics, `--runs`, the stale report and the `order:eval-set` validation), and `docs/LLM.md` and `docs/TESTING.md` change with it.
- From [Latency of call 2](10-latency-of-call-2.md): the turn target is 15 s to the cart for about 10 Items; the spec shows one progress step per Item; whether call 2 runs once per Item comes from [Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md).
- From [Corrections to resolved Items](11-corrections-to-resolved-items.md): the conversation stays open after the cart; call 1 in follow-up mode reads answers and Corrections together and replaces the answer call of ticket 05; a Correction reruns only the corrected Items and simulates the whole cart again; the chat no longer finishes on the cart. The spec needs a slice for it; whether every later cart warns to empty the previous one comes from [Does the cart link add to an open cart](13-does-the-cart-link-add-to-an-open-cart.md).
- From [Measure the levers of call 2 latency](12-measure-the-levers-of-call-2-latency.md): call 2 runs once per Item, up to 10 at a time, on `claude-sonnet-5-5`, 30 Matches, with an `<also-in-this-line>` tag for Items read from the same words. The ADR records it (the model per task and the parallel cap), the spec's call 2 slice builds it, and the turn target waits on [Latency of call 1](14-latency-of-call-1.md).
- From [Does the cart link add to an open cart](13-does-the-cart-link-add-to-an-open-cart.md): logged in, a cart link adds lines to the account cart and sets quantities but never removes a line; logged out, it replaces the cart. Every cart message, the first included, warns the Owner to empty the Carrefour cart before opening the link.
- From [Latency of call 1](14-latency-of-call-1.md): call 1 runs on `claude-sonnet-5-5` with `--effort low`, and `size` and `quantity` are short strings that code parses (see the schema in [design.md](../design.md)). The ADR records the model per task, and the spec targets call 1 at 6 s on average and 7 s at worst for about 10 Items. The turn target of 15 s holds with little room, and search and simulation time are not measured yet.
- From [Notes to the Owner](15-notes-to-the-owner.md): the spec needs the cart message built as agreed there (Notes under their line, the block after the table, the warning before the link, "Nuevo"/"Cambiado" marks, Notes shown once in the first cart holding their Item), `notices` renamed to `notes`, and the price-changed and snapshot-fallback Notes deleted. GLOSSARY.md now defines Note.

## Answer

Written on 2026-10-15.

- **ADR**: `docs/adr/0012-match-items-to-catalog-products-with-two-llm-calls-around-a-search.md`, added to the index. It supersedes ADRs 0001 and 0003 (their `Status` now points at it) and amends ADRs 0004, 0005 and 0006, each of which gained a line saying so. ADR 0006 is amended because `CatalogSearch` is a third port. `GLOSSARY.md`'s Catalog Snapshot no longer says products are picked from live search. `pnpm docs:check` passes.
- **Spec**: [order-matching-build/spec.md](../../order-matching-build/spec.md), with eleven `ready-for-agent` tickets in `order-matching-build/issues/`:
  1. Delete the Product Type seed (no blockers).
  2. Carry the Sale Step and teasers in the Catalog Snapshot (no blockers).
  3. Search the Catalog Snapshot for Matches (02).
  4. Read the order into Items with call 1 (no blockers).
  5. Keep the Fits of each Item with call 2 (03, 04).
  6. Turn Fits into Candidates with the size and quantity rule (02, 04).
  7. Score the product picked with a new eval set (05, 06).
  8. Order in the chat with the new flow (07): the chat switches over, with no questions yet.
  9. Ask when nothing fits and read the answers (08).
  10. Correct the cart after it is shown (09).
  11. Delete the old flow and the Product Types (01, 10).
- **Choices made while writing, which the map had not settled**:
  - The quantity promotion hint stays (ticket 15), but live search goes, so the hint needs teasers from somewhere. Checked on 2026-10-15: `catalog_system/pub/products/search` returns `PromotionTeasers` with the minimum quantity, so the snapshot carries them, and simulation confirms the hint as it does today.
  - Simulations run at most 10 at a time across the order.
  - The "cualquiera" chip is removed.
  - The cart warning reads "Antes de abrir el link, vaciá tu carrito de Carrefour: el link agrega productos pero no saca los que ya estaban."
  - The task names are `parse-order`, `fit-products` and `read-reply`, and the labelling helper is `pnpm order:label`.
  - Until ticket 09 lands, ticket 08 shows an Item with no Fit as not got.
- **Before ticket 01**: the Payment Card removal of ADR 0011 is still uncommitted in the working tree and has to be committed first.
