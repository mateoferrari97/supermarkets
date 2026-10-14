# 03: Count the promotions of the Owner's Payment Card

**What to build:** The Owner writes "pago con Tarjeta Carrefour Mastercard" and card promotions ("20% Off Martes", "2do al 70% Tarjeta Carrefour") count when products are picked and show in the reason. The Owner names the card; a committed table turns the name into the payment system and BIN that the simulation needs. See `.scratch/product-selection/spec.md` (Payment Card table) and `.scratch/carrefour-cart/research/live-search-and-simulation.md`.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `split-order` also returns the Payment Card name the Owner wrote (nullable).
- [ ] A committed Payment Card table maps the names the Owner may write to a payment system id and a BIN, starting with the Tarjeta Carrefour cards, each verified by a live simulation recorded in this ticket; `pnpm check` validates its shape.
- [ ] A card name not in the table is reported back, and products are picked without a card.
- [ ] Every simulation carries `paymentData` for the named card; the picking rules use the resulting prices and the reason names the promotion applied.
- [ ] Tested through `pickProducts` with a fake simulation that prices by card; the adapter test covers a recorded simulation with a card.
- [ ] `pnpm check` exits 0.
