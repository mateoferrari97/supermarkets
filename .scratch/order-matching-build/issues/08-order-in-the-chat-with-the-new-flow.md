# 08: Order in the chat with the new flow

**What to build:** Switch `takeTurn` and the chat to the new flow for an order with no questions: call 1, `matchItems`, Candidates, each Candidate simulated alone in the Branch, the Selection Policy, the whole cart simulated with substitution, and the cart message with Notes as the spec's "Cart message and Notes" says. The old flow is no longer called; ticket 11 deletes it. See the spec, "Turn" and "Cart message and Notes".

**Blocked by:** 07

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Simulation: each Candidate alone at its quantity, at most 10 simulations at a time across the order; unavailable ones dropped; Selection Policy picks; then one simulation of the whole cart; a product unavailable there is replaced by the Item's next ranked Candidate with a Note. An Item with every Candidate unavailable goes to the block with a Note.
- Cart message: `notices` renamed `notes`; Notes under their line in the spec's order (call 2 first, then code); the block after the table (Items not got, then the ignored card or preference); no "Sin producto" rows; the fixed warning before the link on every cart; "El precio cambió al armar el carrito" and "La búsqueda no lo encontró: lo elegí del catálogo" gone; the quantity promotion hint kept, read from snapshot teasers and confirmed by simulation.
- Steps: "understand the order", one per Item, "simulate the cart"; the search and Carrefour candidate steps are removed, with their texts in `src/app/step-text.ts`.
- `OnlineStore.findCandidates` and live search are no longer called.
- Until ticket 09, an Item with no Fit is not asked: it goes to the block as not got, with call 2's question as its Note. Ticket 09 replaces this.

## Constraints

- The chat still ends on the cart until ticket 10.
- The Conversation Log keeps recording every LLM and store call.

## Acceptance

- [ ] `takeTurn` tests with fakes: a cart with Notes under lines and in the block, the warning, substitution at the final simulation, an Item with every Candidate unavailable, an Item with no Fit, `ignoredPreference`, steps in order, abort.
- [ ] One real order of about 10 Items in the chat (`pnpm dev`), including the four failing Items of the baseline: Conversation Log path, the cart, and times of call 1, search, call 2 and simulation noted under Comments, against the 15 s target (simulation not counted).
- [ ] `ARCHITECTURE.md` "An order end to end" describes the new flow; ADR 0005's amendment holds.
- [ ] `pnpm check` exits 0.

## Comments
