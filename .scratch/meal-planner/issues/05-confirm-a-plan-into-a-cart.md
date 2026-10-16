# 05: Confirm a Plan into a cart that shows the Idea

**What to build:** The Owner confirms the Plan shown, in their own words or with a "Confirmar" chip that sends "Confirmo", and gets today's cart. The `plan` task gains the output `{ kind: "confirm" }`, valid only when a Plan was shown. Each Plan Line becomes an Item with `original` "<product name> — <purpose>" and one Candidate, `candidateOf(item, product)` at the line's quantity, passed to the cart as an `ItemToChoose` with that one Candidate: no search, no `fit-products`, no Selection Policy choice. Simulation, Notes, not got, the link and Corrections run unchanged. The Order keeps the Plan's title and Idea, and the chat shows the Idea above the cart table.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `checkedPlan` rejects `confirm` when no Plan was shown, with a test
- [ ] Order tests: a confirmed Plan gives one Item per line with one Candidate each and keeps the Idea; `takeCart` returns it in the Cart shown
- [ ] `takeTurn` test: confirm, simulate, cart with the Idea; an unavailable product is not got with its Note
- [ ] A Correction after a Plan's cart works as after an order
- [ ] The Cart event carries the Idea; the chat shows the "Confirmar" chip and the Idea above the cart table
- [ ] The prompt shows a confirmation in the recipe example
- [ ] Checked by hand in `pnpm dev`: lasaña Plan confirmed into a cart; screenshot in Comments
- [ ] `ARCHITECTURE.md` covers the Plan to Order step
- [ ] `pnpm check` is green

## Comments
