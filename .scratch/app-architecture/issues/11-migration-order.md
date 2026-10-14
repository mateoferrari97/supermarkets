# 11: Migration order

Type: grilling
Status: resolved
Blocked by: 10

## Question

In which order are the build slices migrated (Vitest, layers and dependency rule, `src/cli/`, docs and `pnpm docs:check`, the chat, removing `pnpm order`), and must `pnpm check` pass after every slice, with the old `pnpm order` and the new chat running side by side until the chat replaces it?

## Answer

Decided with the Owner in a grilling session, after reading `package.json` and the answers of [Layers and dependency rule](01-layers-and-dependency-rule.md), [Surviving operator scripts](04-surviving-operator-scripts.md), [Mechanical docs checks](07-mechanical-docs-checks.md) and [Chat plumbing](10-chat-plumbing.md).

Standing rules for every build ticket:

- `pnpm check` exits 0 at the end of each ticket; a slice that cannot end green is cut wrong.
- From the docs ticket on, each ticket updates the docs it touches.

No side by side: the Owner places no orders during the migration, so `pnpm order` is not rewritten over `takeTurn`. `scripts/order.ts` and the `order` script are removed in the ticket that adds `core/order-conversation`. `takeTurn` is covered by Vitest tests with fakes of `Llm` and `OnlineStore`, and `order:eval` keeps covering order resolution against the real LLM; the first live run of the conversation loop (postal code, questions, product selection) is the chat ticket, which closes only after one real order end to end in the chat.

Build tickets and blocking:

| Ticket | Scope | Blocked by |
|---|---|---|
| A | Vitest replaces `node:test` in `src/` and `scripts/`; `pnpm test` runs Vitest | none |
| B | Move code into `src/core/<feature>/`, `src/adapters/<technology>/` and `src/compose.ts`, split the `Llm` and `OnlineStore` ports; behaviour unchanged, existing `scripts/` import the new paths | none |
| C | Turn on the ESLint `no-restricted-imports` layer rule and fix what violates it | B |
| D | Docs layout ([Docs layout](05-docs-layout.md)) and `pnpm docs:check` ([Mechanical docs checks](07-mechanical-docs-checks.md)) | A, C |
| E | `src/cli/` one file per command, `compose` loaders and savers in `adapters/files` with full validation | C |
| F | `core/order-conversation` `takeTurn`, `AbortSignal` on both ports, remove `pnpm order` | A, E |
| G | Next.js chat: NDJSON route handler, sessions, UI of [Chat flow](03-chat-flow.md); closes after one real order end to end | F |

Why this order:

- A and B run in parallel; the Owner accepts merge conflicts on the `*.test.ts` files B moves.
- The layer move is split in two (B, C) to fit one agent session each; both end green.
- D comes after C so `ARCHITECTURE.md` describes folders that exist and its check of cited `src/` paths guards E, F and G; it needs A because `docs/TESTING.md` describes Vitest and `scripts/check-docs.ts` is tested with Vitest.
- E comes before F because `takeTurn` reads its data through the `compose` loaders.
- F needs A because `takeTurn` is tested with Vitest.
