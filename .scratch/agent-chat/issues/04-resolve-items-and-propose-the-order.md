# 04: The agent resolves Items and proposes the Order

**What to build:** The Owner writes what to buy and the agent shows a proposal card: each Item with the product code picked. `resolveItem` searches the Catalog Snapshot, keeps the Fits with call 2 and lets the Selection Policy pick after simulation in the Branch, with no question. An Item with no Fit is left out of the proposal with a Note. The proposal belongs to an open Order, which opens with the first message about something to buy.

**Blocked by:** 03

**Status:** ready-for-agent

- [x] `resolveItem` returns picked when something fits and none otherwise, with the same products as today's order flow for the same Item (tests with fakes)
- [x] The proposal card lists each Item, its product, quantity and price
- [x] The agent never names a product no tool returned
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `order.ts` (zod `ChatOrder` with status `draft`/`proposed`/`closed`, resolved Items by ref, proposal; `openOrder`, `proposalOf`, `renderProposal`, `renderOrder`), `orders-store.ts` (port), `resolve-item.ts` (`resolveItem`: `parseLine` for size and quantity, `matchItems` for search and call 2, `simulateCart` over `candidatesFor` for the pick; `picked`, `none` or `refused`), `propose-order.ts` (`proposeOrder({ refs })`, ends the turn), `tool.ts` (`AgentTool.endsTurn`, `TurnOutcome`, `ToolsForTurn`). `chat.ts` messages gain optional `parts` (a proposal). `takeAgentTurn` builds the tools per turn with a `TurnOutcome`, passes the open Order to the agent and saves the card of the tool that ended the turn.
- Adapter `claude-code-agent.ts`: appends `<order>` to the system prompt and aborts the session when an `endsTurn` tool answers; `generate` then throws `AI_APICallError` "Claude Code process aborted by user", which is read as the end of the turn.
- Storage: `loadOrders`/`saveOrders` in `src/adapters/files/data-files.ts` (`.data/chat/orders.json`, zod), exported by `src/compose.ts`; `createAgentTools()` now returns `Checked<ToolsForTurn>` and fails with the loader's errors without a Catalog Snapshot. Route `POST /api/agent` loads the Orders and the tools (kept on `globalThis` so the Snapshot loads once).
- Page `/agent` shows a proposal as a card (product, quantity, c/u, total, reason, Notes, not found). The root page and `/api/turn` are untouched.
- Prompt `prompts/agent/system.md`: how to take an order, resolve in one step, propose, write nothing after, never name a product or price a tool did not return.
- Docs: `ARCHITECTURE.md`, `docs/LLM.md`, `docs/TESTING.md`, `docs/references/claude-code-provider.md`, Commands in `CLAUDE.md`.
- Tests: `resolve-item.test.ts` (same product, quantity and total as `matchItems` + `simulateCart` for the same Item, none, refusals, Order lifecycle, parallel calls), `propose-order.test.ts`, `order.test.ts`, `tools.test.ts` (registry, `endsTurn`, text to proposal), `take-agent-turn.test.ts`, `claude-code-agent.test.ts` (`<order>` in the prompt, ending the turn, rethrow), `data-files.test.ts` (Orders, message with parts).

Checked by hand against the dev server already running on localhost:3000 (not mine, not restarted; Next hot-reloaded), real Claude Code session, real Carrefour, empty `.data/chat/`, postal code 1425:

- `POST /api/agent {"text":"necesito leche y una coca cola grande"}` (3.1 s): asked for the postal code. `{"text":"1425"}` (19.5 s): saved it, resolved both Items and returned the proposal: Leche entera larga vida Ilolay 1 l. x1 $2239.20 and Gaseosa cola Coca Cola 2,25 lts x1 $6000.00, total $8239.20, with the `proposal` part; `orders.json` held the Order `proposed`.
- `{"text":"agregá una bicicleta rodado 29 y dos yogures"}` (22.0 s): new proposal `order-1-2` with yogur Ilolay 140 grs x2 $2977.50 and the Note `No encontré "bicicleta rodado 29".` left out of the lines; the Order had refs 1 to 4 (3 was `none`).
- Same Items through today's flow (`createOrderMatcher().matchOrder("leche, una coca cola grande, dos yogures")` then `simulateCart`, in a `tsx` script): products 185705, 30138 and 771428 with quantities 1, 1, 2 and totals 2239.2, 6000, 2977.5, the same as the proposal.
- `curl localhost:3000/agent` rendered the Chat with the proposal as a table (product, Cant., c/u, Total, reason, Notes) with prices like `$ 2.239,20`; `curl localhost:3000/` still 200. I did not click in a browser.
- Names of products and prices in those four replies came only from tool results (the proposal text is rendered by code); the agent's follow-up "El pedido ya tiene leche y coca cola grande (2,25 lts)..." used what the `<order>` block holds.
- `.data/chat/` test data was deleted afterwards.

`pnpm check` exited 0 (566 tests in 39 files; eval set validators valid).

Open:
- "The agent never names a product no tool returned" is held by the rendering (the proposal is code) and by the prompt for the agent's free text; nothing scores it until the eval set (ticket 10). I saw no violation in the runs above.
- The proposal total is the sum of each Item's price alone in the Branch; `buildCart` (ticket 05) simulates the whole cart.
- No `choose` with Alternatives: an Item with no Fit is `none` (rounds of questions are ticket 06).
- Time is dominated by call 2 per Item (about 20 s for a postal code plus 2 to 3 Items); the 15 s target of the spec is not met here and was not measured with 40 messages.
- Two turns at once and an abort by a closed tab are still unverified.
