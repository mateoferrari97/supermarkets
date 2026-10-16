# 04: Cart returns the Candidate bought per Item and owns line Notes

**What to build:** The cart simulation takes, per Item, either "choose among these Candidates" or "keep this Candidate with this reason", replacing the `kept` flag. It returns, per Item, either "bought" with the chosen Candidate, its line and its Notes, or "not got" with its Note, plus the total and the cart link. No caller looks a Candidate up by product and quantity again. The cart owns every Note on a line: a kept Item comes back with its reason and no Notes, so a Note about an Item already in the cart is not repeated. The warning to empty the Carrefour cart is still part of what the Cart shown carries. For the Owner nothing changes: the promotion hint ("Llevando N sale ...") stays on its line, and a product that runs out between the per-Candidate simulation and the whole cart is replaced by the next one with a Note.

**Blocked by:** 03 (Order takes the cart result)

**Status:** ready-for-agent

- [ ] `simulateCart` takes per Item "choose" or "keep with reason"; the `kept` flag is gone
- [ ] Each Item's result is "bought" (Candidate, line, Notes) or "not got" (Note)
- [ ] A kept Item keeps its reason and shows no Notes again; "a Note is shown once" has one home, in the cart
- [ ] The Order (ticket 03) consumes the new result and adds only marks and Order-level Notes
- [ ] Cart tests with an Online Store fake check each Item's full result for promotions, discounts, a product that runs out in the whole-cart simulation, kept Items and Items not got
- [ ] `ARCHITECTURE.md` describes the Order and Cart split in an order end to end
- [ ] `pnpm check` is green
