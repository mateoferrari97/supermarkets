# 08: "Lo mismo que la última vez"

**What to build:** Each turn the agent gets the last 3 closed Orders (Items and products, no prices). "Lo mismo que la última vez" proposes that Order again, its products resolved in today's Branch. An addition with no open Order ("agregá yogur") asks once whether to repeat the last Order with it or start a new one, naming the last Order.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] A repeated Order says which products are no longer available
- [x] The context holds the last 3 closed Orders and nothing older (tests)
- [x] `docs/LLM.md` records the rules
- [ ] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `order.ts` gains `PAST_ORDERS` (3), `lastClosedOrders` (closed Orders in saved order, the last 3), `boughtLines` (a closed Order's cart lines) and `renderPastOrders` (the `<past-orders>` block: id, opening time and, per bought line, the Item's words, product code, name and quantity; no prices). `repeat-order.ts` is the new `repeatOrder({ orderId })` tool: it refuses `no-postal-code`, `order-open`, `unknown-order` (not among the last 3) and `nothing-to-repeat`; otherwise it simulates the old cart's products at their quantities in today's Branch (again without the unavailable ones, like `buildCart`), opens a new Order with each line as `picked` at today's price, or `none` with the Note `"<product>" ya no está disponible.`, and answers `repeated`. `take-agent-turn.ts` takes the optional `orders` and gives the agent `pastOrders: lastClosedOrders(orders)`; `agent.ts` carries `pastOrders`; the adapter appends `renderPastOrders` to the system prompt; the route passes the loaded Orders. No new dependency, no storage change.
- Prompt `prompts/agent/system.md`: how to read `<past-orders>`, "lo mismo que la última vez" calls `repeatOrder` then `proposeOrder`, an addition with no open Order asks once (text, naming the last Order's products) whether to repeat it with the addition or start a new one. Docs: `ARCHITECTURE.md` (turn end to end step 6, folder list), `docs/LLM.md`, `docs/TESTING.md`.
- Tests: `repeat-order.test.ts` (same products and quantities priced again in a new Order, unavailable products reported as `none` and left out of the second simulation, all unavailable, only the last 3 Orders repeat, the refusals), `order.test.ts` (`lastClosedOrders` keeps the last 3 and no open one, `renderPastOrders` has no prices), `take-agent-turn.test.ts` (the agent gets the last 3 closed Orders out of 4 plus an open one), `tools.test.ts` (repeat the last Order with an addition: one product gone is a Note in the proposal; tool list), `claude-code-agent.test.ts` (the `<past-orders>` block in the system prompt).
- Checked by hand against the dev server already on localhost:3000 (not mine), real Claude Code session, real Carrefour, empty `.data/chat/` (deleted afterwards): "Hola, mi código postal es 1425"; "necesito leche y pan lactal"; "Confirmar" (cart); "lo mismo que la última vez" returned a proposal with the same two products and the same total ($6738.20); "Confirmar" built the second cart; "agregá yogur" returned "¿Querés que repita el pedido de leche y pan lactal y le agregue yogur, o armamos un pedido nuevo solo con el yogur?" with no search. `orders.json` held `order-1` and `order-2`, both closed with two picked Items.
- Not done: the answer to that question ("repetí con yogur" or "uno nuevo") was not run live, and a product gone from the Branch was only tested with fakes (nothing in the live catalog was unavailable). I did not click in a browser. Whether the agent asks only when it should is the model's judgement until the eval set (ticket 10).
- `pnpm check` exited 0.
