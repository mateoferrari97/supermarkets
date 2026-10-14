---
Status: accepted
---

# The Owner orders in a local chat that replaces the order command

The Owner orders in a small web chat instead of `pnpm order`, which is removed. The chat first asks for the postal code and checks it with Carrefour, asking again until one is accepted, as the order command does today. Then it keeps the flow of ADR 0004: the Owner writes the order as free text, the app answers with all open questions in one numbered message (each with option chips and free text), and once nothing is left to ask it picks the products with no extra confirmation. While the LLM and Carrefour work, one message lists the steps live; the answer is a cart table with the reason for each product, its notices, quantities, prices, the total, the postal code and the Payment Card, followed by the cart's notices, the preferences no rule could apply and the link that opens the cart at Carrefour, with no cost or timing line.

The conversation is a state machine in core, `takeTurn(state, reply, deps, onStep)` in `src/core/order-conversation/`, tested with fakes of `Llm` and `OnlineStore`; the route handler stays thin. Progress is a typed `onStep` callback argument, not a port; `src/app/` turns its events into Spanish step texts.

Each turn is one `POST` route handler that streams NDJSON events (session id, step started, step done, questions, cart, error), read in the browser with `fetch` and `response.body.getReader()` (streaming from a route handler: https://nextjs.org/docs/app/api-reference/file-conventions/route). The `OrderResolution` stays on the server, in a `Map` held on `globalThis` in a server-only module of `src/app/`, under a session id the server creates with `crypto.randomUUID()`; the browser keeps only that id and sends the reply text. A session is deleted when its cart is delivered, when a turn fails, or after one hour without a turn. Closing the tab aborts the turn through `request.signal`, passed as an `AbortSignal` to every method of both ports, and the session keeps its state from before the turn; a turn for a session already working gets 409.

Restarting `pnpm dev` loses orders in progress, and reloading the page starts a new order; the Owner accepted both.

## Considered Options

- **A stateless server, with the browser sending the whole state each turn.** Compared with the Owner and rejected: the server-held state keeps the browser trivial.
- **A live order panel answered per Item, or one question per screen.** Prototyped; the Owner chose the classic chat.
- **Server-Sent Events.** `EventSource` is GET-only, so the reply would need a second channel.
- **Polling.** Needs job state on the server.
- **Server actions.** Streaming progress from one is not confirmed by the official docs.
- **Keeping `pnpm order` beside the chat during the migration.** The Owner places no orders during the migration, so it is not rewritten over `takeTurn`.
