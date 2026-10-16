# Testing

## Runner

Every test runs with Vitest (ADR 0007): `pnpm test` is `vitest run`, and `pnpm check` runs it. `vitest.config.ts` includes `src/**/*.test.ts` and `scripts/**/*.test.ts` and excludes `.scratch`, `.claude`, `.data` and `.next`. Test files import `describe` and `it` from `vitest` and assert with `node:assert/strict`.

## Where tests go

A test sits next to the file it tests, named `<file>.test.ts`: `src/core/order-matching/match-items.test.ts` tests `match-items.ts`. Repo tooling in `scripts/` is tested the same way (`scripts/check-docs.test.ts`). A table of cases shared by two tests lives in its own file next to the code it describes: `src/core/order-matching/item-line-cases.ts` lists every size and quantity text with the Item it parses to or its failure, and both `item.test.ts` and `src/adapters/claude-code/llm-output-schemas.test.ts` (the line schema accepts exactly what the parser accepts) run it.

## What a test checks

Test behaviour through public functions: what the Owner is asked and gets, what Carrefour and the LLM are asked, what a command prints and its exit code. Do not test how state or caches are stored.

## No live calls

Tests never call Carrefour or start a Claude Code session.

- Core use cases take their ports as arguments, so tests pass fakes of `Llm` and `OnlineStore` (see `src/core/order-conversation/take-turn.test.ts` and `src/core/order-matching/match-items.test.ts`).
- The Carrefour adapter takes an `HttpClient`; its tests answer with recorded responses from `src/adapters/carrefour/fixtures/`, kept next to the adapter that reads them. To add one, record the real answer once and save it there as JSON; [Carrefour API](references/carrefour-api.md#fixtures) lists what each fixture records.
- The Claude Code adapter takes a `ProcessRunner`; its tests fake the process and its JSON output (`src/adapters/claude-code/claude-code-llm.test.ts`).
- The rules of a conversation (asking, re-asking once and dropping an Item after its second question, Corrections, drops, choices, new Items, marks on the lines and the Notes under the table) are tested in `src/core/order-conversation/order.test.ts` with plain data and no fakes: an Order, a read reply, match results and a simulated cart in, the next Order, what it asks or buys and the Cart shown out. What the cart simulation buys is tested through `simulateCart` with an `OnlineStore` fake in `src/core/product-selection/cart.test.ts`, checking each Item's whole result: the Candidate bought, its line with reason and Notes, or the Note of an Item not got, for promotions, discounts, a product that runs out in the whole cart and kept Items. The Selection Policy is one table of cases in `src/core/product-selection/selection.test.ts` run with both price sources, simulated through an `OnlineStore` fake and the Catalog Snapshot, so the chat and the eval set's pick are tested once. `take-turn.test.ts` covers the wiring: which ports each stage calls with what input, steps, abort, invalid LLM answers, and whole orders from text to cart.
- The Plan checks are tested in `src/core/planning/plan.test.ts` with plain data, one test per rule, the search loop in `src/core/planning/plan-searches.test.ts` with a fake `plan` and a small catalog, and the budget retry in `src/core/planning/plan-budget.test.ts` the same way.
- The agent chat: `takeAgentTurn` is tested in `src/core/agent-chat/take-agent-turn.test.ts` with a fake `ChatAgent` and a list for `save` (what is saved and in what order, the last 40 messages the agent gets, the Owner's message kept when the agent fails). The adapter is tested in `src/adapters/agent/claude-code-agent.test.ts` with `MockLanguageModelV4` from `ai/test`, so no Claude Code session starts: the system prompt file read on each turn, the messages sent and an answer with no text. `updateProfile` and the tools are tested in `src/core/agent-chat/tools.test.ts` with a fake `OnlineStore` (saved, replaced by a new postal code, refused when not delivered or malformed with nothing saved, input validation); the adapter test also checks that the Profile reaches the system prompt, that the tools reach the model factory and that the session allows only them. `resolveItem` is tested in `src/core/agent-chat/resolve-item.test.ts` with fakes of `CatalogSearch`, `FitProductsLlm`, `OnlineStore` and the `OrdersStore` (picked with the same product, quantity and total as `matchItems` plus `simulateCart` for the same Item, none when nothing fits or nothing is available, refusals without a postal code or with an unreadable quantity, the open Order, its refs and Items resolved at once); `proposeOrder` in `propose-order.test.ts` (the proposal, the card the turn ends with, refusals that save nothing) and the Order's schemas and rendering in `order.test.ts`. The fakes they share are in `src/core/agent-chat/agent-chat-fixtures.ts`. The adapter test also checks that a tool with `endsTurn` aborts the session after it answers and that other failures are rethrown, and `take-agent-turn.test.ts` that the card of an ended turn is what is saved. The loaders and savers of the Chat (with a message that has parts), the Profile and the Orders are tested in `src/adapters/files/data-files.test.ts` against a temporary folder: round trip across instances and rejection of invalid lines or files.
- A test that needs files writes them to a temporary folder from `node:os` `tmpdir()`, not into the repo.

## The eval set is not a test

`evals/order-matching.json` measures the product picked per Item against the real LLM and the current Catalog Snapshot: Items read right, Matches recall, Fits precision and recall, pick right, wrong picks nobody sees, questions, stability, time and cost; its answer cases measure how `read-reply` reads a reply to questions. `pnpm order:eval` runs it on demand, 3 times per case, and costs money; it is not part of `pnpm test` or `pnpm check`. `pnpm check` only validates the eval set's shape (`pnpm order:eval-set`). The scoring itself is pure code in `src/core/order-matching/` with tests over fixed inputs. See [LLM](LLM.md#the-eval-set).

`evals/planning.json` measures the same way the Topic of `route-message` and the first Plan `plan` shows: stock, budget, quantity ranges, forbidden products and words, one line per product and the kind of Idea sections, with an LLM judge of the Idea reported apart. `pnpm plan:eval` runs it on demand and `pnpm plan:eval-set` validates its shape in `pnpm check`. Its scoring is tested over fixed inputs in `src/core/planning/eval-score.test.ts`, the run of a first message with a fake `plan` in `eval-run.test.ts`, the loader checks in `eval-set.test.ts` and the report in `src/cli/plan-eval-report.test.ts`. See [LLM](LLM.md#the-planning-eval-set).

## Data validators

`pnpm order:eval-set` and `pnpm plan:eval-set` validate the committed data in `evals/` and run in `pnpm check` after the tests.
