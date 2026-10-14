Status: ready-for-agent

# Move to a layered Next.js app with a chat and an agent-first knowledge base

## Problem Statement

The Owner orders through `pnpm order`, a terminal script that owns the whole conversation: `scripts/order.ts` asks for the postal code, resolves the order, loops over the questions, picks the products and prints the cart. Nothing of that conversation is in `src/`, so it has no tests and no other front end can reuse it. The rest of the code has grown by feature (`src/order-resolution/`, `src/product-selection/`, ...) with adapters mixed in: `claude-code-llm.ts` sits next to `resolve-order.ts`, `carrefour-store.ts` next to `pick-products.ts`, and the operator scripts read and write files with `node:fs` directly. No rule stops core logic from importing an adapter.

Agents working in the repo have only `CLAUDE.md`, `GLOSSARY.md`, five ADRs and one rules document. There is no description of the layers or of an order end to end, nothing checks that docs still match the code, and three ADRs cite `.scratch/`, which can be deleted at any time.

## Solution

The code moves into the layers of ADR 0006: `src/core/<feature>/`, `src/adapters/<technology>/`, `src/compose.ts`, and two delivery adapters over the same use cases, `src/cli/` (every operator command except `order`) and `src/app/` (a Next.js chat, ADR 0007). ESLint enforces the dependency rule. The conversation of `scripts/order.ts` becomes `takeTurn` in `src/core/order-conversation/`, tested with fakes; `pnpm order` is removed and the Owner orders in the chat of ADR 0008, started with `pnpm dev`. Vitest replaces `node:test`. The knowledge base takes the layout of ADR 0009 and `pnpm docs:check` checks it as ADR 0010 says.

The migration is seven build tickets in `issues/`. `pnpm check` exits 0 at the end of every ticket; a slice that cannot end green is cut wrong. From the docs ticket on, each ticket updates the docs it touches.

## User Stories

1. As the Owner, I want to open a chat at `pnpm dev` and order there, so that I do not need a terminal session per order.
2. As the Owner, I want the chat to ask for my postal code first and check it with Carrefour, asking again when Carrefour does not deliver there or does not accept it, so that everything I see is for where I live.
3. As the Owner, I want to write my order as free text once my postal code is accepted, so that I order the way I do today.
4. As the Owner, I want all open questions in one numbered message, so that I answer them together.
5. As the Owner, I want each question's options as chips I can click into my reply, plus "cualquiera", so that I answer fast without typing.
6. As the Owner, I want to type the whole reply myself if I prefer, so that chips never get in the way.
7. As the Owner, I want the questions I left unclear asked again, so that nothing is guessed.
8. As the Owner, I want products picked as soon as nothing is left to ask, so that I do not confirm twice.
9. As the Owner, I want to see each step while the LLM and Carrefour work, with a spinner and then its seconds, so that I know the app is not stuck.
10. As the Owner, I want the input disabled while a turn runs, so that I do not send a reply mid-turn.
11. As the Owner, I want a cart table with product, what I asked for, why it was picked, notices, quantity, unit price and line total, so that I can check every line.
12. As the Owner, I want the total with the postal code and Payment Card, the cart's notices, the preferences no rule could apply and the link that opens the cart at Carrefour, so that I can open it and pay.
13. As the Owner, I do not want session counts, time or cost in the chat, so that the answer is about my order.
14. As the Owner, I want closing the tab to stop the work in progress, so that Claude Code sessions and Carrefour calls do not keep running for nobody.
15. As the Owner, I want a reload to start a new order, so that I always know where I am.
16. As the operator, I want every operator command under its current `pnpm` name, so that the `seed-product-types` and `review-product-type-doubts` skills keep working unchanged.
17. As the operator, I want the chat to fail at startup with a clear message when vocabulary or Payment Cards data is invalid, so that no order breaks halfway.
18. As the developer, I want the conversation tested with fakes of `Llm` and `OnlineStore`, so that the postal code, question and pick loop is covered without live calls.
19. As the developer, I want `pnpm lint` to fail when `core` imports an adapter or `cli` and `app` import `adapters`, so that the layers hold.
20. As the developer, I want one test runner for `src/` and `scripts/`, so that `pnpm test` covers everything in `pnpm check`.
21. As an agent, I want a ~100-line `CLAUDE.md` that maps into `ARCHITECTURE.md` and `docs/`, so that I find the knowledge I need without reading everything.
22. As an agent, I want `pnpm docs:check` to fail on broken links, missing indexes, references into `.scratch/`, stale `src/` paths and wrong file names, so that the docs I read match the repo.

## Implementation Decisions

Layers and placement (ADR 0006):

- `src/core/catalog/`: `text.ts`, `catalog.ts`.
- `src/core/order-resolution/`: `resolve-order.ts`, `bm25.ts`, `eval-set.ts`; `llm.ts` splits into the `Llm` port file (the port with the input and output types of its calls) and a concepts file (`Item`, `SelectionPolicy`, `Evidence`). The zod schemas that parse LLM output (`splitOrderOutputSchema` and the others) move to `adapters/claude-code`.
- `src/core/product-selection/`: `pick-products.ts`, `payment-cards.ts`, `postal-code.ts`; `store.ts` splits into the `OnlineStore` port file and a concepts file (`PaymentCard`, `Measure`).
- `src/core/product-types/`, `src/core/product-type-seed/`: as today.
- `src/core/order-conversation/`: new, `takeTurn` (ticket 06).
- `src/adapters/carrefour/`: `carrefour-store.ts`, `snapshotProducts`, and the download and `summarizeTipos` logic of `scripts/carrefour-catalog.ts`, exposed as `downloadCatalog(outputDir)`.
- `src/adapters/claude-code/`: `claude-code-llm.ts` and the LLM output schemas.
- `src/adapters/files/`: what `scripts/order-files.ts` and `scripts/seed-files.ts` do today; the only place that knows paths and the layout of `.data/`, `vocabulary/`, `evals/` and `prompts/`.
- `src/compose.ts`: wires adapters into use cases and exposes named loaders and savers (for example `loadOrderData()`, `saveParts(parts)`, saving and reading eval runs) and `createOrderResolver({ model? })` wired to Claude Code with the default model. Every data loader runs the full validation (schema plus cross-references), the same one the validator commands run.
- `scripts/` keeps only `format.mjs`, `no-comments.ts` and `check-docs.ts`.

Dependency rule: ESLint `no-restricted-imports` in `eslint.config.js`. `core` imports only `core` and zod; `adapters` import `core`, `node:*` and zod; `compose` imports `core` and `adapters`; `cli` and `app` import `core` and `compose`. Imports between features inside `core` are free.

Operator commands:

- One file per command in `src/cli/<command>.ts`, run by `package.json` through `tsx`: `carrefour:catalog`, `seed:split`, `seed:check-proposal`, `seed:consolidate`, `seed:coverage`, `seed:doubts`, `order:eval`, `product-types`, `payment-cards`, `order:eval-set`. No subcommand parser, no new dependency.
- `src/cli/report.ts` holds the "print errors and exit 1, or print the success line" pattern.
- `cli` uses only the `process` global and never `node:fs`.
- `order:eval`: running and scoring one eval case (hit, miss or error) moves to `core/order-resolution`; filters, rendering, the comparison with the previous run and `renderItem` stay in `cli`.
- The validators stay commands run by `pnpm check`; each becomes "load through `compose` and report errors".

Conversation (ADR 0008):

- `takeTurn(state, replyText, deps, onStep) → { state, reply }` is a state machine over postal code, order resolution, questions and product selection. A new conversation starts by asking "¿A qué código postal es el envío?"; the postal code is parsed with `postalCodeFrom` and checked with `OnlineStore.checkDelivery`, and refusals use today's texts ("Carrefour no entrega en el código postal <code>.", `"<text>" no es un código postal válido.`). Once accepted, the next reply is the order text. Then the open questions, as `resolveOrder` and `answerQuestions` produce them. Once nothing is left to ask, `pickProducts` runs and the reply is the Product Selection.
- `onStep(event)` is an argument, not a port; the event type lives in `core/order-conversation`, with typed kinds (for example `{ kind: "search-item", phrase }`). `order:eval` omits it.
- Every method of `Llm` and `OnlineStore` takes an `AbortSignal`; `takeTurn` passes its signal to every call. The Claude Code adapter kills its child process on abort; the Carrefour adapter passes the signal to `fetch`.
- `scripts/order.ts` and the `order` script are removed in the same ticket. No side by side: the Owner places no orders during the migration.

Chat (ADR 0007, ADR 0008):

- Next.js 16 App Router in `src/app/`, `next.config.ts` with `agentRules: false`; `pnpm dev` runs `next dev`.
- One `POST` route handler per turn streams NDJSON events: session id (first event of the first turn), step started, step done with seconds, questions, cart, error. The client reads them with `fetch` and `response.body.getReader()`.
- Sessions: a `Map<sessionId, state>` in a server-only module of `src/app/`, held on `globalThis`. The id comes from `crypto.randomUUID()` on the first turn and the client keeps it in React state. A session is deleted when its cart is delivered, when its turn fails, and after one hour without a turn. A turn for a session already working answers 409. `request.signal` is passed to `takeTurn`; an aborted turn leaves the session as it was before the turn.
- `src/app/` turns step events into the Spanish texts of the prototype (understanding the order, searching each item, translating the preference, Carrefour candidates, simulating the cart).
- The final message shows the cart table (product, what the Owner asked for, reason, notices, quantity, unit price, line total), the total with postal code and Payment Card, the cart's notices, the preferences no rule could apply, and the cart link. No session count, time or cost.
- The app loads its data through `compose` before any order is read, so invalid data fails with the loader's message, not mid-order.

Toolchain (ADR 0007):

- `vitest run` as `pnpm test`, with `include` set to `src/**/*.test.ts` and `scripts/**/*.test.ts` and `.scratch`, `.claude`, `.data` and `.next` excluded. Test files import from `vitest` instead of `node:test`; `node:assert/strict` stays. The test-file `no-floating-promises` exception in `eslint.config.js` is removed.
- `typescript` stays aliased to TypeScript 6; `pnpm typecheck` stays on TypeScript 7.
- `@next/eslint-plugin-next` only, not `eslint-config-next`. `.next/` and `next-env.d.ts` are ignored by ESLint, Prettier, git and `scripts/no-comments.ts`. `tsconfig.json` is reformatted after Next rewrites it, with `src/app` covered by `include`.

Knowledge base (ADR 0009, ADR 0010):

- `CLAUDE.md`: current rules plus a Map (pointers to `ARCHITECTURE.md`, `GLOSSARY.md`, `docs/adr/README.md`, `docs/product-specs/README.md`, `docs/references/README.md`, `docs/agents/README.md`, `docs/LLM.md`, `docs/TESTING.md`, `.scratch/`), Commands (`pnpm dev`, `pnpm check`, `pnpm test`, `pnpm docs:check`, every operator command) replacing "Catalog data", a short Workflow (wayfinder map, spec and tickets in `.scratch/`, ADRs and glossary) and File naming. At most 120 lines.
- `ARCHITECTURE.md`: the product in one paragraph, layers and ports, a codemap of an order end to end naming the module of each step, and a Data section on `vocabulary/`, `evals/`, `prompts/` and `.data/` (what each is, who writes it, who validates it, committed or not).
- `docs/LLM.md`: the LLM translates and code decides (ADR 0002), where prompts live, how to change one and measure it with `order:eval`.
- `docs/TESTING.md`: Vitest, recorded fixtures next to the adapter that uses them, no live calls in tests, the eval set apart from tests.
- `docs/product-specs/product-type-seed-rules.md`: moved from `docs/`; the `seed-product-types` skill is updated to the new path.
- `docs/references/carrefour-api.md`: Carrefour endpoints (search, facets, simulation, regions), quirks and fixtures, summarised from the Carrefour research notes in `.scratch/`. ADRs 0001, 0002 and 0005 stop citing `.scratch/`: Carrefour facts point at this reference, and the Thinking Machines result in ADR 0002 cites its original source.
- `docs/adr/README.md`, `docs/product-specs/README.md`, `docs/references/README.md`, `docs/agents/README.md`: indexes.
- `scripts/check-docs.ts` with Vitest tests, run as `pnpm docs:check` after `pnpm no-comments` in `pnpm check`, with the seven checks of ADR 0010.

## Testing Decisions

- Good tests check behaviour through public functions: what the Owner is asked and gets, what Carrefour and the LLM are asked, what a command prints and its exit code. Not how state or caches are stored.
- Moves keep every existing test passing; test files move next to the code they test.
- `takeTurn`: tests with fakes of `Llm` and `OnlineStore` for each state: postal code missing, rejected, not served and accepted; order resolved with and without questions; unclear answers asking again; product selection reached; `onStep` events in order; an aborted signal stopping the turn and leaving the state as before. Prior art: `resolve-order.test.ts` and `pick-products.test.ts` with fakes.
- Adapters: abort tests for both. Prior art: `claude-code-llm.test.ts` (fake `ProcessRunner`) and `carrefour-store.test.ts` (fake `HttpClient` with recorded fixtures).
- `compose` loaders: invalid vocabulary, mapping and Payment Cards data fail with the same errors the validator commands print. Prior art: `validate.test.ts`, `payment-cards.test.ts`.
- `scripts/check-docs.ts`: one test per check over small in-memory or temporary file trees. Prior art: `scripts/no-comments.ts`.
- The route handler and React UI have no Vitest tests (async Server Components are not supported, ADR 0007); they stay thin and are checked by one real order end to end in the chat, recorded in the chat ticket.
- No live calls in tests; `order:eval` keeps covering order resolution against the real LLM.
- `pnpm check` exits 0 after every ticket.

## Out of Scope

- Deploying the app, secrets, and hosting the Catalog Snapshot outside `.data/`.
- Moving the LLM adapter to the Anthropic API.
- Persisting sessions across `pnpm dev` restarts or page reloads; remembering the postal code between orders.
- A recurring doc-gardening agent; `QUALITY_SCORE.md`, `tech-debt-tracker.md` and the other harness-engineering documents.
- React component tests and end-to-end browser tests.
- Behaviour changes to order resolution or product selection beyond the `AbortSignal`.

## Further Notes

- The decisions behind this spec are in ADRs 0006 to 0010 and in the closed map `.scratch/app-architecture/map.md`, including the throwaway chat prototype on branch `prototype/chat-flow` (commit `0cca765`) and the toolchain research on branches `research/toolchain-compatibility` and `research/toolchain-compatibility-2`.
- Tickets 01 and 02 run in parallel and conflict on the `*.test.ts` files ticket 02 moves; the Owner accepts resolving that by hand.
- Toolchain unknowns from the research: whether TypeScript 7 works with Next's editor plugin and with `next build` type-checking (the alias avoids both), and whether every rule of the React, import and a11y ESLint plugins works on ESLint 10 (not installed).
