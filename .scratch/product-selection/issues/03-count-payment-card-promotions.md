# 03: Count the promotions of the Owner's Payment Card

**What to build:** The Owner writes "pago con Tarjeta Carrefour Mastercard" and card promotions ("20% Off Martes", "2do al 70% Tarjeta Carrefour") count when products are picked and show in the reason. The Owner names the card; a committed table turns the name into the payment system and BIN that the simulation needs. See `.scratch/product-selection/spec.md` (Payment Card table) and `.scratch/carrefour-cart/research/live-search-and-simulation.md`.

**Blocked by:** 01

**Status:** resolved

- [x] `split-order` also returns the Payment Card name the Owner wrote (nullable).
- [x] A committed Payment Card table maps the names the Owner may write to a payment system id and a BIN, starting with the Tarjeta Carrefour cards, each verified by a live simulation recorded in this ticket; `pnpm check` validates its shape.
- [x] A card name not in the table is reported back, and products are picked without a card.
- [x] Every simulation carries `paymentData` for the named card; the picking rules use the resulting prices and the reason names the promotion applied.
- [x] Tested through `pickProducts` with a fake simulation that prices by card; the adapter test covers a recorded simulation with a card.
- [x] `pnpm check` exits 0.

## Comments

`split-order` returns `paymentCard` (nullable). The table is `vocabulary/carrefour-payment-cards.json`, validated by `pnpm payment-cards` (in `pnpm check`) with `src/product-selection/payment-cards.ts`; names match after `normalize`. Every simulation sends `paymentData.payments[0]` with the card's `paymentSystem`, its `bin` when known, `installments: 1` and `value`/`referenceValue` 0 (0 is accepted: the promotion applied the same as with the cart total). An unknown card is an order-level notice in the Product Selection.

Live simulations on 2026-10-14 (a Wednesday), postal code 1425, sku 3807 (Coca-Cola 2,25 l, $6,000):
- No card: quantity 2 at $4,500 each ("PROMO-2do al 50%"). The response lists payment systems 502 "Tarjeta Carrefour Mastercard" and 505 "Prepaga BSF", and teasers "Tarjeta Carrefour 15%" (`RestrictionsBins` 507858, 858110, 858111, 585274, 538156, 520225, 539958, 527061, 898989) and "2do al 70% Tarjeta Carrefour o Cuenta digital …" (`PaymentMethodId` 502, 505).
- 502 with BIN 507858: quantity 2 at $3,900 each ("2do al 70% Tarjeta Carrefour o Cuenta digital Max 48 Combinable 9 al 15.10 COCA COLA"); quantity 1 at $5,100 ("Tarjeta Carrefour 15%"). Recorded in `fixtures/simulation-card.json`.
- 505 with no BIN: quantity 2 at $3,900 each, same promotion.
- Visa (2) with BIN 450995: $6,000, no promotion.

Not verified: that the names "Tarjeta Mi Carrefour Crédito" and "Tarjeta Mi Carrefour Prepaga" (product properties of sku 3807) are the cards of payment systems 502 and 505; they are in the table as names the Owner may write. The other BINs of "Tarjeta Carrefour 15%" were not tried.

Real run on 2026-10-14: "2 coca de 2,25, medio kilo de banana y una yerba, pago con Tarjeta Carrefour, nada de Taragüí, envío a 1425" picked Coca-Cola 2,25 x2 at $3,900 each ("2do al 70% Tarjeta Carrefour …"), Banana selección x kg x1 (0,5 kg) at $849.58 and Yerba Carrefour Classic 1 kg at $3,442.50 (both "Tarjeta Carrefour 15%"); total $12,092.08, Carrefour 6.4 s, 5 Claude Code sessions.
