# 05: Confirm the Order and get the cart link

**What to build:** The Owner confirms the proposal (the "Confirmar" chip or in their own words) and gets the cart, as today, with its link. `buildCart` refuses a proposal that is not the latest or that no Owner message has followed. Giving the link closes the Order; the next message about something to buy opens a new one.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] No cart is built for an unanswered or stale proposal (tests)
- [x] The Order closes when its link is given (tests)
- [x] A full order from the first message to the link works in the new page, checked by hand
- [x] `ARCHITECTURE.md` describes an agent turn end to end
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `build-cart.ts` (`buildCart({ proposalId })`; refuses `no-postal-code`, `no-open-order`, `no-proposal`, `stale-proposal`, `unanswered`, `nothing-available`; otherwise simulates the whole proposal with `OnlineStore.simulate`, drops a line that ran out with a Note and simulates the rest again, builds the link with `cartLink`, closes the Order with its `Cart` and ends the turn with the cart). "Answered" means the Chat holds an Owner message after the message that showed that proposal; the tools now receive the whole Chat (`ToolsForTurn = (outcome, messages?)`). `order.ts` gains `cartSchema`, `ChatOrder.cart` (optional) and `renderCart`; `chat.ts` gains the `cart` message part; `renderOrder` says whether the proposal is waiting for the Owner or out of date.
- A refusal must not end the turn: `ChatAgent` turns now carry `turnEnded()` and the adapter aborts the session after an `endsTurn` tool only when the turn really ended (otherwise a refused `buildCart` would have saved an empty Assistant message). Documented in `docs/references/claude-code-provider.md`.
- Prompt `prompts/agent/system.md`: confirmation, `buildCart` only after a clear acceptance of the latest proposal, propose again on a change, nothing after `buildCart`, a closed Order means a new request opens a new one.
- Page `/agent`: the proposal card shows a "Confirmar" chip while it is the last message (it sends "Confirmar" as the Owner's message); the cart is a card with lines, total, warning and "Abrir el carrito en Carrefour". The root page and `/api/turn` are untouched.
- Route: the tools were cached on `globalThis` for the life of the dev server, so a code change kept serving the old tools (found by hand: "no tengo disponible la herramienta para armar el carrito"). The cache is now tied to the route module, so a hot reload rebuilds the tools.
- Docs: `ARCHITECTURE.md` (new "An agent turn end to end", layers, app, data), `docs/LLM.md`, `docs/TESTING.md`, `docs/references/claude-code-provider.md`.
- Tests: `build-cart.test.ts` (answered latest proposal builds and closes the Order, unanswered, answered-before-proposal, never shown, stale id, Item changed after it, no proposal, no open Order, no postal code, same proposal twice, product that ran out, nothing available, new Order after the link), `tools.test.ts` (text to closed Order through the tools, refusal before the Owner answers), `claude-code-agent.test.ts` (a refusal does not abort the session), `data-files.test.ts` (cart part and Order with cart round trip).

Checked by hand against the dev server already running on localhost:3000 (not mine, not restarted; Next hot-reloaded), real Claude Code session, real Carrefour, empty `.data/chat/`:

- `POST /api/agent` "Hola, mi código postal es 1425" (5.4 s): saved. "necesito leche y dos yogures" (18.3 s): proposal `order-1-1`, leche Ilolay 1 l x1 $2239.20 and yogur Ilolay 140 grs x2 $2977.50, total $5216.70.
- "Confirmar" while the server still held the old tools (before the route fix): the agent said it had no tool for the cart and nothing was built (`orders.json` stayed `proposed`).
- After the fix, "Dale, confirmo el pedido" (5.5 s): the message was the cart card with the same lines and total $5216.70, the Carrefour warning and the link `https://www.carrefour.com.ar/checkout/cart/add?sku=273621&qty=02&seller=1&sku=9100&qty=1&seller=1&sc=1`; `orders.json` had `order-1` `closed` with `cart`.
- Next message "necesito una coca cola grande" (12.1 s) opened `order-2` and proposed Coca Cola 2,25 lts $6000.00; "mejor agregá también un pan lactal" (13.2 s) made proposal `order-2-2` (Coca Cola plus pan lacteado $4499.00, total $10499.00); "sí, confirmo" (5.8 s) built the cart; `orders.json` held `order-1` and `order-2`, both `closed` with a `cart`, `order-2` with 2 proposals.
- `curl localhost:3000/agent` rendered 4 "Listo, este es tu carrito" and 2 "Abrir el carrito en Carrefour" (one per cart); `curl localhost:3000/` still 200. `.data/chat/` was deleted afterwards.
- Not done: I did not click in a browser, so the "Confirmar" chip (a button that sends the text "Confirmar") was only checked by typing that text through the API, and the cards only by their server-rendered HTML. The refusal of an unanswered or stale proposal is covered by the tests with fakes; the model never tried to build one in the runs above, so a live refusal was not seen. I did not open a cart link in Carrefour.
- Open: the Owner's acceptance is judged by the model (the prompt lists examples); nothing scores a wrong cart-building on an ambiguous reply until the eval set (ticket 10). A line that ran out is dropped, not replaced by the next best product as the order flow does.


`pnpm check` exited 0 (580 tests in 40 files; eval set validators valid).
