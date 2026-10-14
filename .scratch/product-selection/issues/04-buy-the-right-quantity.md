# 04: Buy the right quantity, including products sold by weight

**What to build:** An Item with no quantity is bought once, a fraction is rounded up and told, a product sold by weight is bought in its steps ("medio kilo de banana" is one 0.5 kg step), and when a promotion needs more units than were asked the line says how much cheaper it would be, without adding units. See `.scratch/product-selection/spec.md` (Quantities, Promotion hint).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] No quantity is 1; a fractional quantity of a product sold by unit is rounded up to whole units with a notice.
- [ ] For a product sold by weight, the amount comes from the Item (a weight term such as "500 g", or the quantity in kg) and is sent as kg / `unitMultiplier` rounded up, with a notice when rounded; with no amount, one step is bought.
- [ ] When a Candidate's teaser has a `minimumQuantity` above the quantity bought, the line says the unit price at that quantity; no units are added.
- [ ] Tested through `pickProducts` with fake ports, including a recorded weighed product.
- [ ] `pnpm check` exits 0.
