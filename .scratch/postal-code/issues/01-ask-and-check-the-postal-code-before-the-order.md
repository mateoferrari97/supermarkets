# 01: Ask and check the postal code before the order

**What to build:** Before the order is read, the order command gets the Owner's postal code, as an argument or by asking "¿A qué código postal es el envío?", and checks it with Carrefour. The four digits are taken from what the Owner wrote ("1425", "CP 1425", "C1425ABC"); text without four digits is asked again without calling Carrefour. The postal code is accepted only when Carrefour returns a region with at least one store. When there is no region or the region has no stores, the Owner is told "Carrefour no entrega en el código postal <code>" and asked again. When Carrefour rejects the postal code (HTTP 400 `ORD006`), the Owner is told it is not valid and asked again. When the Owner gives none, the command stops. Only then is the order text read. Product picking takes the accepted postal code as its own input and every search and simulation uses it; candidate search never runs without a `regionId`. The cart states the postal code it was built for. See `.scratch/postal-code/spec.md`.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] The Online Store answers whether it delivers to a postal code: delivers, does not deliver, or postal code rejected; other errors propagate.
- [x] The Carrefour adapter answers it from the regions endpoint, reusing the cached region for search; tested with recorded regions responses for a region with stores (1425), an empty region `SW#` ("C1425ABC") and a rejected postal code (400 `ORD006`, "abc").
- [x] Candidate search in the Carrefour adapter fails when no region is found instead of searching without `regionId`; tested.
- [x] Product picking takes the accepted postal code as an input next to the resolved order, refuses to run without one, and passes it to every search and simulation; tested through `pickProducts` with a fake Online Store.
- [x] The order command takes the postal code as an argument or asks for it first, loops until one is accepted or none is given, and only then reads the order.
- [x] The cart printed by the order command states the postal code it was built for.
- [x] Manual run recorded in this ticket: no postal code, a non-served one, a rejected one, then 1425.
- [x] `pnpm check` exits 0.

## Comments

Manual run on 2026-10-14 (`pnpm order "yerba"` and `pnpm order "yerba, envío a 1425"`):

- No postal code: an empty answer to "¿A qué código postal es el envío?" prints "Sin código postal no puedo armar el pedido." and exits 1 before the order is read.
- "por casa" and "abc": answered with `"<text>" no es un código postal válido.` and asked again, without calling Carrefour (no four digits).
- "C1425ABC": its four digits (1425) are checked, accepted, and the cart reads "Carrito (código postal 1425):". "envío a 1425" in the order text gave no Item.
- Non-served postal code: not reproducible live on this date. The regions endpoint returned stores for every four-digit code tried (0000, 0001, 0100, 0999, 1000, 2000, 3000, 4000, 5000, 8000, 8300, 9000, 9100, 9405, 9410, 9420, 9431, 9999); 2000 no longer comes back without delivery. The "does not deliver" path is covered by the adapter test with the recorded `SW#` region ("C1425ABC" sent as is) and prints "Carrefour no entrega en el código postal <code>." in `scripts/order.ts`.
- Rejected by Carrefour (400 `ORD006`): only reachable with text that has four digits Carrefour still rejects, none found; covered by the adapter test with the recorded "abc" response.
