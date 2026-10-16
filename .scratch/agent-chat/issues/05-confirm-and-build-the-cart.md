# 05: Confirm the Order and get the cart link

**What to build:** The Owner confirms the proposal (the "Confirmar" chip or in their own words) and gets the cart, as today, with its link. `buildCart` refuses a proposal that is not the latest or that no Owner message has followed. Giving the link closes the Order; the next message about something to buy opens a new one.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] No cart is built for an unanswered or stale proposal (tests)
- [ ] The Order closes when its link is given (tests)
- [ ] A full order from the first message to the link works in the new page, checked by hand
- [ ] `ARCHITECTURE.md` describes an agent turn end to end
- [ ] `pnpm check` is green

## Comments
