Status: ready-for-agent

# Agent chat: one persisted Chat, a Profile, past Orders, and an agent with tools

## Problem Statement

The Assistant is meant to end up in a channel such as WhatsApp: one endless thread per person, messages that arrive one after another, and past conversations the Assistant must understand. Today it cannot:

- Every conversation starts from nothing. The postal code is asked each time (`src/core/order-conversation/take-turn.ts`, stage `postal-code`), and nothing is kept between conversations by design (ADR 0004).
- The state lives in a `Map` in memory, expires after an idle hour and dies with a reload or a restart (`src/app/sessions.ts`). The Conversation Log is written and never read back.
- A fixed state machine decides the steps (route, read, match, ask, cart). An Owner who ordered on Monday and writes "agregá yogur" on Friday cannot be understood.
- Questions come one Item at a time, with no recommended answer and no sense of what the Owner already said or bought.

## Solution

The Assistant becomes one agent over a persisted Chat (ADR 0014):

1. **Chat, Profile and Orders on disk.** Every message, the Profile (the postal code for now) and every Order are JSON under `.data/chat/`. There is one Owner and no identity.
2. **An agent per turn.** Each Owner message runs `ToolLoopAgent` (AI SDK 7) on a local Claude Code session through `ai-sdk-provider-claude-code`. It sees the Profile, the open Order, the last 3 closed Orders and the last 40 messages, and acts through tools.
3. **Tools wrap the core.** Saving the Profile, resolving an Item (search, call 2, Selection Policy), asking a round of questions, proposing the Order and building the cart. Code picks every product; the agent never names one a tool did not return.
4. **Rounds of questions as messages.** A round has numbered questions, each with options and a recommended one, and ends the turn; the Owner's reply is the next message. This works the same on the web and on WhatsApp.
5. **Confirm, then cart.** The agent proposes the Order; only after the Owner answers it does code build the cart. The Order closes when its link is given; a clear Correction soon after reopens it.
6. **A better web chat.** The page opens on the whole Chat; rounds, proposals and carts are cards.

## User Stories

1. As the Owner, I want to tell my postal code once and never be asked again, so that ordering is quick.
2. As the Owner, I want to change my postal code by just saying so, so that I can order from somewhere else.
3. As the Owner, I want to open the chat and see everything we said before, so that I can pick up where I left off.
4. As the Owner, I want to write "agregá yogur" days after an order and be asked whether it is the same as last time plus yogur or a new order, so that the Assistant uses what I bought before.
5. As the Owner, I want "lo mismo que la última vez" to work, so that I do not retype a regular order.
6. As the Owner, I want a product I name precisely to go into the cart without questions, so that the Assistant asks as little as possible.
7. As the Owner, I want 3 options when nothing matches what I asked for, and 3 more when I say "más opciones", so that I can find the right one.
8. As the Owner, I want all open questions in one round, each with a recommended answer I can accept in one tap, so that answering is fast.
9. As the Owner, I want to see the Order and confirm it before any cart is built, so that nothing is bought by mistake.
10. As the Owner, I want to say "cambiá la leche por descremada" right after the cart and get a new link without being asked anything, so that corrections are easy.
11. As the Owner, I want to ask for a recipe, a menu or a gift in the same chat, so that planning and ordering are one conversation.
12. As the Owner, I want my question answered when it is not about shopping, briefly, with what the chat can do, so that I know how to use it.
13. As a developer, I want the Chat to be the only state, read from disk each turn, so that a restart or a second channel loses nothing.
14. As a developer, I want every tool to be a core function tested with fakes, so that the agent's behaviour is testable without a live session.
15. As a developer, I want an agent eval set over scripted Owner messages, so that a prompt or model change is measured before it ships.
16. As a developer, I want the agent behind a port, so that moving from Claude Code to an API model or another channel changes an adapter only.

## Implementation Decisions

- **Decision record.** ADR 0014. It amends ADR 0004, 0006, 0011, 0012 and 0013 by reference.
- **Glossary.** **Owner**, **Chat** and **Profile** are added, and **Order** and **Conversation Log** are redefined. **Topic** goes when the router is deleted (ticket 11).
- **Storage.** `.data/chat/messages.jsonl` (one message per line, oldest first), `.data/chat/profile.json` and `.data/chat/orders.json`. They are read and written only through loaders and savers in `src/compose.ts`, validated with zod. A message holds its role, its time, its text and, for the Assistant, its structured parts (a round, a proposal, a cart).
- **Context per turn.** The Profile, the open Order, the last 3 closed Orders (Items and products chosen, no prices) and the last 40 messages. No summary of older messages.
- **Agent runtime.** `ToolLoopAgent` from `ai` 7 with `ai-sdk-provider-claude-code` 4.x. The tools go to the session through its `createAiSdkMcpServer`, since the provider ignores AI SDK `tools`. It is wired in an adapter and reached through a port, and `ai` is never imported by `src/core/`. The model and budget per turn are set in the adapter. Ticket 01 confirms the runtime before anything else is built.
- **Tools.** Each is a core function with a zod input and output:
  - `updateProfile({ postalCode })`: checks the postal code with `OnlineStore.checkDelivery` and saves it.
  - `resolveItem({ description, quantity, brand?, excludeProductIds? })`: searches, keeps the Fits with call 2 and picks with the Selection Policy after simulation. It returns `{ kind: "picked", product }` when something fits. Otherwise it returns `{ kind: "choose", alternatives }` with 3 Alternatives not in `excludeProductIds`, or `{ kind: "none" }`. "Más opciones" is the same call with the shown products excluded.
  - `askQuestions({ questions })`: each question has a number, the Item it is about, its text, options (product ids from `resolveItem`, or free values) and a recommended option. It records the round as an Assistant message and ends the turn.
  - `proposeOrder({ items })`: records the proposal on the open Order and ends the turn.
  - `buildCart({ proposalId })`: simulates, builds the cart link, closes the Order and records the cart. It refuses a proposal that is not the latest one or that no Owner message has followed.
  - `reopenLastOrder()`: reopens the last closed Order for a Correction.
  - `searchCatalog({ queries })` (`plan` scope, ticket 09): the Plan search, under the checks of ADR 0013.
- **Order lifecycle.** draft, then proposed, then closed (link given). A new Order opens with the first message about something to buy when none is open.
- **Prompt.** One system prompt in `prompts/agent/`, read every turn. It covers: ask as little as possible, ask only when a tool returns `choose` or the request is ambiguous, ask in one round, always confirm before the cart, use past Orders when the Owner refers to them, and never name a product no tool returned.
- **Web chat.** `src/app/` loads the Chat on open. It shows rounds as cards (options, "Más opciones", "Aceptar recomendadas"), a proposal as a card with "Confirmar", and the cart as today. Progress steps stay. Tokens are not streamed. There is no "new conversation" button.
- **Staged replacement.** The agent chat is a new page next to today's chat, which stays the default and untouched until the agent covers it. `takeTurn`, `routeMessage`, `split-order`, `read-reply`, the in-memory sessions and the old eval sets are deleted when the agent chat becomes the only chat (ticket 11). `pnpm check` is green after every ticket.
- **Docs.** `ARCHITECTURE.md` (the turn end to end, ports, `.data/chat/`), `docs/LLM.md` (the agent, its tools and prompt, the eval set), `docs/TESTING.md` and the Commands of `CLAUDE.md`, each in the ticket that changes them.

## Testing Decisions

- A good test checks behaviour through a module's interface: what goes in, what comes out, what a port was asked.
- **Tools.** Pure tests with fakes of `OnlineStore`, `CatalogSearch` and `Llm`: picked, choose (3 at a time, excluded ids respected) and none; `buildCart` refusing an unanswered or stale proposal; Order lifecycle and reopen. Prior art: `match-items.test.ts`, `order.test.ts`.
- **Storage.** Loaders and savers round-trip and reject invalid files. Prior art: the existing loaders in `src/adapters/files/`.
- **Context.** Building the turn context from a Chat picks the right Orders and messages.
- **Adapter.** Tool wiring and prompt rendering with a fake session. No live calls (`docs/TESTING.md`).
- **Eval set** (not a test). Scripted Owner messages over a Chat with a given Profile and past Orders. It is scored by code on tool calls (postal code not asked when known, `askQuestions` only after `choose`, `buildCart` only after a proposal) and on the products of the cart. A validator joins `pnpm check`; the runner is a command like `pnpm order:eval`.

## Out of Scope

- WhatsApp, Jira or any channel but the web chat.
- More than one Owner, identities, accounts or linking channels.
- Preferences in the Profile ("leche siempre descremada", "sin TACC"), payment cards and delivery slots.
- Summarising old messages.
- Streaming tokens.
- Asking among several Fits: the Selection Policy picks with no question.

## Further Notes

- Decided in a grilling session on 2026-10-16. The three options for the question loop (a form with slots, an agent with tools, rounds followed by today's pipeline) are recorded in ADR 0014.
- Verified: `ai` 7.0.143 and `ai-sdk-provider-claude-code` 4.3.3 on npm (`npm view`). The provider ignores AI SDK `tools`, rejects tools without `execute`, and ignores `temperature`, `seed` and `toolChoice` other than `auto` (its README on GitHub). `addToolOutput` answers client-side tools (https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage).
- Not verified: how AI SDK persists and reloads UI messages; whether the provider holds a full tool loop on this machine within the 15 s target; whether a Claude subscription may serve people other than its owner, which must be checked before any channel opens to others.
