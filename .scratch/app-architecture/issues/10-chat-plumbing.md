# 10: Chat plumbing

Type: grilling
Status: resolved
Blocked by: 01, 02, 03

## Question

How do the chat's progress steps, questions and final cart (see 03) reach the browser while the LLM and Carrefour work: streaming from a route handler, server actions, or polling? Where do the in-memory session store and the progress reporting sit in the layers of 01, and when does the store forget a session?

## Answer

Decided with the Owner in a grilling session, after reading `scripts/order.ts`, `src/order-resolution/resolve-order.ts` and `src/product-selection/pick-products.ts`: today core reports no progress (`resolveOrder`, `answerQuestions` and `pickProducts` are one-shot async functions) and the whole conversation (postal code loop, resolve, question loop, pick, timings) lives in `scripts/order.ts`.

Transport:

- One `POST` route handler per turn streams NDJSON events (step started, step done with seconds, questions, cart, error); the client reads them with `fetch` and `response.body.getReader()`. Streaming a `ReadableStream` from a route handler is documented in https://nextjs.org/docs/app/api-reference/file-conventions/route (section Streaming). Rejected: SSE (`EventSource` is GET-only, so a second channel), polling (needs job state), server actions (streaming progress from one is not confirmed by official docs).

Conversation in core:

- A new use case `src/core/order-conversation/` owns the conversation now in `scripts/order.ts`: `takeTurn(state, replyText, deps, onStep) → { state, reply }`, a state machine over postal code, resolution, questions and product selection, tested with Vitest and fakes of `Llm` and `OnlineStore`. The route handler stays thin.
- Core reports progress through an `onStep(event)` callback passed as an argument, with the event type defined in core. It is not a port; only `Llm` and `OnlineStore` are ports, as decided in [Layers and dependency rule](01-layers-and-dependency-rule.md). Callers that need no progress (`order:eval`) omit it.
- Events are typed (for example `{ kind: "search-item", phrase }`); `src/app/` turns them into the Spanish step texts of [Chat flow](03-chat-flow.md).

Session store:

- A `Map<sessionId, state>` in a server-only module of `src/app/`, held on `globalThis` so `next dev` hot reload does not empty it.
- A session is deleted when its cart is delivered, when its turn fails, and after 1 hour without a turn. No size cap.
- The server creates the session id with `crypto.randomUUID()` on the first turn and sends it as the first stream event; the client keeps it in React state. Reloading the page starts a new order.

Disconnects and concurrency:

- If the Owner closes the tab mid-turn, the turn is aborted: `request.signal` is passed through `takeTurn` to every method of the `Llm` and `OnlineStore` ports (Claude Code child processes and Carrefour `fetch` calls), so both ports gain an `AbortSignal` parameter. The session keeps its state from before the turn and the Owner resends the message.
- A turn for a session that is already working is rejected with 409.
