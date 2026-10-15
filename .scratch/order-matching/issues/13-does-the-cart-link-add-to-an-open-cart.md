# 13: Does the cart link add to an open cart

Type: task
Status: resolved
Blocked by:

## Question

When the Owner opens a cart link (`/checkout/cart/add?sku=...&qty=...&seller=1&sc=1`, built in `src/adapters/carrefour/carrefour-store.ts:292`) and later opens a second one in the same browser, does Carrefour add the second link's products to the cart already there, or replace it? Is it the same logged in and logged out? This needs a browser, so the Owner runs it (HITL): open a link with one product, then a link with another product and the first one, and report what the cart holds. Record the result in `docs/references/carrefour-api.md`. It decides whether every cart after the first warns the Owner to empty the previous one ([Corrections to resolved Items](11-corrections-to-resolved-items.md)).

## Answer

It depends on the session; a cart link never sums quantities. The Owner ran three links in order from an empty cart on 2026-10-15 (`9100`×1, then `105933`×1 + `9100`×2, then `105933`×1):

- Logged out (incognito): each link replaces the cart; it ends with only `105933`×1.
- Logged in: each link adds its lines and sets the quantity of lines already there; it ends with `105933`×1 + `9100`×2. An item a Correction removed stays in the Carrefour cart.

Recorded in `docs/references/carrefour-api.md` (Cart link).

Consequence for [Corrections to resolved Items](11-corrections-to-resolved-items.md): the Owner checks out logged in, where a link cannot remove a line, so every cart message warns the Owner to empty the Carrefour cart before opening the link. That includes the first cart of a conversation, since a logged-in account cart can still hold items from an earlier order. Whether a line with `qty=0` removes an item was not tested.
