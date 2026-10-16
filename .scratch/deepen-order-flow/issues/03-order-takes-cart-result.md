# 03: Order takes the cart result: marks and Order-level Notes

**What to build:** The Order takes the simulated cart and returns the next conversation state plus the Cart shown. The marks and the Order-level Notes live with the Order. The Owner sees the same thing as today: a Correction to an Item in the cart reruns only that Item and marks its line as changed, Items added after the cart are marked as new, and the Notes under the table keep today's order (dropped Items, Items not got, removed Items, the ignored preference).

**Blocked by:** 02 (Order module: questions, read-reply and matching hand-off)

**Status:** ready-for-agent

- [ ] The Order exposes "take the cart result" and returns the next `ConversationState` plus the Cart shown, with marks and the Notes under the table
- [ ] The Order tracks whether the cart was shown, and marks lines as new or changed from that
- [ ] Notes under the table keep today's order and wording
- [ ] The tests for marks and Order-level Notes move from `take-turn.test.ts` to Order tests
- [ ] `takeTurn` tests cover only wiring: stages, ports called, steps, abort, an invalid LLM answer, one end-to-end order
- [ ] `pnpm check` is green
