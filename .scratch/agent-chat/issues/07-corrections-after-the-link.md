# 07: Corrections right after the link

**What to build:** Right after the link, a clear Correction ("cambiá la leche por descremada", "sacá el pan") reopens the last Order with `reopenLastOrder` and gives a new link with no question. Only the last closed Order can be reopened.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] A Correction after the link yields a new cart for the same Order (tests)
- [x] Only the last closed Order reopens (tests)
- [ ] Checked by hand in the new page
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `reopen-last-order.ts` (`reopenLastOrder()`: refuses `order-open` while any Order is open and `no-closed-order` when there are none, so only the last closed Order can reopen; otherwise the Order goes to `proposed` with `reopened: true`). `order.ts`: `ChatOrder.reopened` (optional) and `renderOrder` says so. `build-cart.ts`: a reopened Order does not need an Owner message after its proposal (the Correction is the answer), and closing clears `reopened`. `propose-order.ts`: on a reopened Order the proposal is recorded but the turn does not end, so the agent can call `buildCart` right after it in the same turn (found by hand: with the turn ending at `proposeOrder` the agent showed a proposal and asked). `tools.ts`: the `reopenLastOrder` tool. Prompt `prompts/agent/system.md`: how to handle a Correction. Docs: `ARCHITECTURE.md`, `docs/LLM.md`, `docs/TESTING.md`.
- Tests: `reopen-last-order.test.ts` (only the last Order reopens, refused while one is open or none exists), `build-cart.test.ts` (a reopened Order builds with no Owner answer and clears `reopened`), `tools.test.ts` (text, confirm, then a Correction: reopen, resolve what is new, propose without ending the turn, build; same Order, new cart with only the corrected line, tool list updated).
- Checked by hand against the dev server already on localhost:3000 (not mine, hot reload), real Claude Code session, real Carrefour, empty `.data/chat/` (deleted afterwards): "Hola, mi código postal es 1425"; "necesito leche y pan lactal" (proposal order-1-1); "Confirmar" (cart link). Then "cambiá la leche por leche descremada" returned a new cart (Leche descremada Ilolay plus the bread, new link) with no question, and "sacá el pan" returned a new cart with only the leche (`https://www.carrefour.com.ar/checkout/cart/add?sku=10765&qty=1&seller=1&sc=1`). `orders.json` then held one Order, `order-1`, closed, 3 proposals, no `reopened`, cart with the descremada line. `curl localhost:3000/agent` rendered 3 "Abrir el carrito en Carrefour"; `curl localhost:3000/` 200. Before the `proposeOrder` fix, the same Correction produced a proposal and a question.
- Not done: I did not click in a browser, so the third box stays unchecked; the cards were only seen through the API and the server-rendered HTML. I did not try, live, to correct an older Order than the last one (covered by tests with fakes only). "Soon after" is not limited in code: whether a message is a Correction is the model's judgement until the eval set (ticket 10).
- `pnpm check` exited 0.
