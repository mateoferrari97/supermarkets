# 03: Order takes the cart result: marks and Order-level Notes

**What to build:** The Order takes the simulated cart and returns the next conversation state plus the Cart shown. The marks and the Order-level Notes live with the Order. The Owner sees the same thing as today: a Correction to an Item in the cart reruns only that Item and marks its line as changed, Items added after the cart are marked as new, and the Notes under the table keep today's order (dropped Items, Items not got, removed Items, the ignored preference).

**Blocked by:** 02 (Order module: questions, read-reply and matching hand-off)

**Status:** resolved

- [x] The Order exposes "take the cart result" and returns the next `ConversationState` plus the Cart shown, with marks and the Notes under the table
- [x] The Order tracks whether the cart was shown, and marks lines as new or changed from that
- [x] Notes under the table keep today's order and wording
- [x] The tests for marks and Order-level Notes move from `take-turn.test.ts` to Order tests
- [x] `takeTurn` tests cover only wiring: stages, ports called, steps, abort, an invalid LLM answer, one end-to-end order
- [x] `pnpm check` is green

## Comments

- `takeCart(order, simulated)` in `src/core/order-conversation/order.ts` takes the simulated cart and returns `{ state, cart }`: the next state (stage `cart`, the bought Items in the cart, Notes cleared, `cartShown` true) and the Cart shown with marks and the Notes under the table (dropped, not got, removed, ignored preference). It throws while a question is open or when the results do not pair with the Items to buy. `Cart`, `CartLineShown` and `IGNORED_PREFERENCE_NOTE` moved to the Order; `take-turn.ts` re-exports the types for the app, and `boughtItem` is gone.
- The Order still finds the Candidate bought by product and quantity and replaces a kept line's reason and Notes; ticket 04 moves that into the cart's result.
- Marks and Order-level Notes are tested in `order.test.ts`. The cart behaviour tests that ran through `takeTurn` (line Notes and promotion hint, unavailable Candidates, the whole-cart replacement, kept Items) moved to a new `src/core/product-selection/cart.test.ts` against today's `simulateCart`; ticket 04 reshapes them for its new interface.
