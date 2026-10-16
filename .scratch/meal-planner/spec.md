Status: needs-triage

# Plans: recipes, events, weekly menus, gifts and advice turned into a Carrefour cart

## Problem Statement

The Owner can only place an order by naming what to buy. When they think in terms of an intent ("quiero hacer lasaña para 4", "un asado para 10 con unos $50.000", "las comidas de la semana sin TACC", "un regalo para mi vieja, le gusta cocinar"), the chat sends the message to `parse-order`, which reads it as an order. The Conversation Log of 2026-10-16 shows the result: the asado message became five vague lines (`Carne para asado`, `Ensaladas`, `Picada`, `Vino`, `Whisky`), four of them with quantity `minimum`, and the headcount and budget were lost (`.scratch/meal-planner/research/llm-shopping-assistants.md`, section B).

Three more gaps:

- The words matter and nobody checks them: `pnpm order:label "Carne para asado"` lists dog snacks and knives first, while `pnpm order:label asado` lists "Asado de Novillo x kg".
- Gifts cannot be found: `CatalogSearch` leaves out Electro y tecnología, Automotor, Indumentaria, Juguetería y Librería and Aire Libre y Ocio (`EXCLUDED_DEPARTMENTS` in `src/adapters/catalog-search/in-memory-catalog-search.ts`).
- Nothing carries the idea: `Order` and `Item` hold no recipe, menu or gift reason (`src/core/order-conversation/order.ts`, `src/core/order-matching/item.ts`), so the cart cannot show why each product is there.

## Solution

The chat gains a planning conversation in front of the existing cart:

1. **Route.** The first message after the postal code goes to a cheap `route-message` call that labels it `order`, `plan` or `off-topic`. `order` runs today's flow unchanged. `off-topic` gets a fixed reply and the Owner can write again. `plan` starts a planning conversation.
2. **Plan with the catalog.** A `plan` call talks with the Owner. In each turn it may ask code to search the Catalog Snapshot (in every department, in stock) and gets the results back, for a fixed number of search rounds, before it answers. Its answer is a message to the Owner and, when it has one, a Plan: the Idea (a recipe with steps, a menu per day, gift ideas with their reasons, or advice) and Plan Lines, each a product it saw in a search with a quantity and a purpose.
3. **Check the Plan in code.** Every product is one the planner saw this conversation, every quantity is valid for that product, lines with the same product are merged, and the snapshot total is computed. When the Owner gave a budget and the total exceeds it, code sends the Plan back to the planner once with the difference.
4. **Revise and confirm.** The Owner sees the Plan (Idea, lines with snapshot prices, total) and can ask for changes, which go to the planner again, or confirm it. Advice can end with no Plan.
5. **Cart.** A confirmed Plan becomes an Order whose Items each have one Candidate, the product in the Plan Line at its quantity. Today's simulation, cart, Notes, link and Corrections run unchanged. The cart reply shows the Idea above the table, and each line's `original` names its purpose.

The eight cases in scope, all shipped together:

1. A single recipe ("lasaña para 4"): ingredients scaled to servings, steps in the Idea.
2. An event ("asado para 10, unos $50.000"): amounts per person, budget.
3. A weekly menu ("comidas de la semana, sin TACC"): dishes per day, ingredients shared between dishes summed into one line.
4. A gift ("algo para mi vieja, le gusta cocinar, hasta $30.000"): products from every department, a reason per idea, no servings.
5. Advice with no purchase ("¿qué vino va con pescado?"): an answer, and a Plan only if the Owner wants to buy.
6. Constraints in any case: budget, diet, allergies, and what the Owner already has at home, which is left out.
7. The Idea returned with the cart.
8. Off-topic messages answered with fixed text.

## User Stories

1. As the Owner, I want to say "quiero hacer lasaña para 4" and get the ingredients in the right amounts, so that I do not have to write the list myself.
2. As the Owner, I want the recipe steps with the cart, so that I know what to do with what I bought.
3. As the Owner, I want to say how many people come and how much I want to spend, so that the Plan fits both.
4. As the Owner, I want to see the Plan's total before I confirm, so that I know whether it fits my budget.
5. As the Owner, I want to be told when the Plan is still over my budget, so that I can decide what to cut.
6. As the Owner, I want a menu for the week with each dish on its day, so that I can cook from it.
7. As the Owner, I want an ingredient used in three dishes bought once with the summed amount, so that the cart has no repeated lines.
8. As the Owner, I want to say "sin TACC" or name an allergy and get a Plan that respects it, so that I can trust it.
9. As the Owner, I want to say "ya tengo aceite y sal" and not get them, so that I do not buy twice.
10. As the Owner, I want gift ideas for a person I describe, with a reason for each, from anything Carrefour sells, so that I can pick one.
11. As the Owner, I want to ask "¿qué vino va con pescado?" and get an answer without having to buy, so that the chat helps me decide.
12. As the Owner, I want to turn that answer into a purchase if I want, so that I do not have to start again.
13. As the Owner, I want to change the Plan in my own words ("sacá el postre", "que sea para 6", "otra marca de vino"), so that I shape it before buying.
14. As the Owner, I want to confirm the Plan in my own words or with one tap, so that the cart is built only when I say so.
15. As the Owner, I want every product in the Plan to be a real Carrefour product with its price, so that what I confirm is what I get.
16. As the Owner, I want a product that is not available in my Branch to be shown in the cart as not got, so that I know what is missing.
17. As the Owner, I want to correct the cart after a Plan as I do after an order, so that nothing changes in how I fix a cart.
18. As the Owner, I want each cart line to say what it is for ("para la lasaña", "regalo para mamá"), so that I recognize it.
19. As the Owner, I want a plain order ("2 leches y pan") to work exactly as today, so that planning never gets in the way.
20. As the Owner, I want a message that has nothing to do with shopping answered briefly with what the chat can do, so that I know how to use it.
21. As the Owner, I want to see the steps while the planner thinks and searches, so that I know the app is working.
22. As a developer, I want the planner's searches and answers in the Conversation Log, so that I can review a bad Plan.
23. As a developer, I want every product id, quantity and search round checked in core, so that a fake or a second adapter cannot return a Plan the chat would reject.
24. As a developer, I want the routing and planning measured by an eval set in `pnpm check` and an eval command, so that a prompt change is measured before it ships.

## Implementation Decisions

- **Decision record.** This feature lets the LLM pick products and propose quantities, which ADR 0002, ADR 0004, ADR 0012 and `docs/LLM.md` ("Never let the LLM choose a price, compute a quantity or invent a product") forbid for orders. A new ADR states the rule for Plans: the planner may only propose products it saw in a code search and quantities valid for them; code checks both; nothing reaches the cart until the Owner confirms; a confirmed Plan Line counts as the Owner's own choice. Orders keep today's rules. ADR 0004 (planner left out) and ADR 0012 (two calls around a search) are amended by reference, not rewritten.
- **Glossary.** Add **Plan** (a proposal of products with quantities and the Idea behind them, which the Owner revises and confirms before it becomes a cart), **Plan Line** (one product of a Plan with its quantity and purpose), **Idea** (what a Plan is for: a recipe with steps, a menu per day, gift ideas with their reasons, or advice; shown with the Plan and the cart) and **Topic** (the label `route-message` gives a message: order, plan or off-topic). Avoid "shopping list", "recipe list" and "suggestion".
- **`Llm` port.** Two new tasks:
  - `routeMessage(text) → { topic: "order" | "plan" | "off-topic" }`.
  - `plan(input) → output`. The input is the planning conversation (the Owner's and the planner's messages so far), the products returned by every search of this conversation (product id, name, brand, department, Tipo, snapshot price, sale kind and size or Sale Step) and the last Plan shown. The output is one of `{ kind: "search", queries }` (up to 8 queries in catalog words), `{ kind: "answer", message, plan | null, budget | null }` or `{ kind: "confirm" }` (the Owner accepted the last Plan shown).
  - A Plan is `{ title, idea, lines }`, where `idea` is a list of sections (`{ heading, text }`) and each line is `{ productId, quantity, purpose, reason }`. A packaged product's quantity is a whole number of units; a by-weight product's is grams.
- **Plan checks (core, next to the port, like `checkedFitProducts`).** `checkedPlan` rejects an answer that breaks a rule, naming the task and the rule: every `productId` was returned by a search of this conversation; every quantity is positive, whole for packaged products and in grams for by-weight ones; `confirm` only when a Plan was shown; at most 8 queries per search and at most 60 lines. A by-weight quantity is rounded up to its Sale Step by the same rule as Candidates, with the same Note.
- **Search loop (core).** For each Owner message in planning, core calls `plan`; while the answer is `search` and fewer than 3 rounds were spent this turn, it runs each query with `CatalogSearch` (20 Matches each), adds the results to the products seen, and calls `plan` again. A fourth `search` ends the turn with an error. Each round is one step.
- **Search scope.** `CatalogSearch.findMatches` takes a scope: `order` keeps today's excluded departments; `plan` searches every in-stock product. Orders never see the new departments.
- **Plan in code.** After the checks, code merges lines with the same `productId` (summed quantity, purposes joined), computes the snapshot total, and, when the answer carries a budget and the total exceeds it, calls `plan` once more with the difference before showing the Plan. If it is still over, the Plan is shown with a line saying by how much.
- **Conversation state.** A new stage `planning` holds the postal code, the planning messages, the products seen and the last Plan shown. `takeTurn` routes only in stage `order`. In `planning`, every reply goes to `plan`; `confirm` builds the Order; an answer with no Plan stays in `planning`.
- **Plan to Order.** Each Plan Line becomes an Item whose `original` is "<product name> — <purpose>" and whose only Candidate is `candidateOf(item, product)` at the line's quantity, passed to the cart as an `ItemToChoose` with that one Candidate. No search, no `fit-products`, no Selection Policy choice. The Order keeps the Plan's title and Idea; `takeCart` passes them to the Cart shown. Corrections after the cart use `read-reply` as today.
- **Replies and events.** `Reply` gains `{ kind: "plan", message, plan, total, overBudget }` and `ask` covers advice and off-topic text. `turn-events` gains a `plan` event. The Cart carries the Idea. New step kinds: understanding the message, planning, searching "<query>".
- **Chat.** It shows a Plan as the Idea, a table of lines (product, quantity, purpose, snapshot price) and the total, with a "Confirmar" chip that sends "Confirmo". It shows the Idea above the cart table.
- **Adapter.** `TASK_MODELS` gets `route-message` on `claude-haiku-5-5` at its default effort and `plan` on `claude-sonnet-5-5` at its default effort; both are measured by the evals and may change. The budget per session becomes per task, since a `plan` session reads many products. Sessions keep running with no tools; the search loop lives in core. Prompts: `prompts/planning/route-message.md` and `prompts/planning/plan.md`, with examples for each of the eight cases.
- **Off-topic text.** Fixed in code: "Puedo ayudarte con compras del súper: pedidos, recetas, comidas de la semana, eventos y regalos de Carrefour. ¿Qué necesitás?"
- **Carrefour checkout for the new departments.** Before planning searches them, it must be verified that `simulate` and `cartLink` work for products of every newly searchable department (possible third-party sellers). A department that does not work stays excluded from the `plan` scope and the reference doc says why.
- **Docs.** `ARCHITECTURE.md` (a Plan end to end, the new stage, ports and folders), `docs/LLM.md` (the two tasks, the Plan checks, the search loop, the new eval set), `docs/TESTING.md`, `docs/references/carrefour-api.md` (checkout of the new departments), the Commands of `CLAUDE.md`.

## Testing Decisions

- A good test checks behaviour through a module's interface: what goes in, what comes out, what a port was asked.
- **Plan checks**: pure tests, one per rule, plus Sale Step rounding. Prior art: `match-items.test.ts`, `read-reply.test.ts`.
- **Search loop**: with a fake `plan` that asks for searches and a small catalog: rounds run, results reach the next call, the fourth round fails, abort stops it, one step per round.
- **Plan in code**: merging lines, totals, the over-budget retry and the over-budget line, as plain data tests.
- **Plan to Order**: a confirmed Plan gives Items with one Candidate each and keeps the Idea; `takeCart` returns the Idea in the Cart shown. Prior art: `order.test.ts`.
- **`takeTurn`**: wiring only: routing per Topic, the planning stage, confirm, a plain order still runs today's flow. Prior art: `take-turn.test.ts`.
- **Search scope**: `order` keeps the exclusions, `plan` returns a product of an excluded department. Prior art: `in-memory-catalog-search.test.ts`.
- **Adapter**: prompt rendering, output schemas and `TASK_MODELS`, with the fake process runner. No live calls (`docs/TESTING.md`).
- **Eval set** (not a test): `evals/planning.json` with routing cases (a message and its Topic) and plan cases (a first message, scored on the first Plan shown after its search rounds). Scored by code: every line in stock in the Catalog Snapshot; total within the budget; quantity ranges for named products (the meat of an asado for 10 between given grams); products or words that must not appear (gluten for "sin TACC", what the Owner already has); one line per product; at least one Idea section of the right kind. Scored by an LLM judge with a fixed rubric, reported apart and never failing the run: whether the Idea is sensible for the request. Cases cover the eight cases in scope. `pnpm plan:eval [filter...] [--runs N]` runs it; `pnpm plan:eval-set` validates it and joins `pnpm check`.

## Out of Scope

- Starting a Plan after a cart was shown; it needs a new conversation.
- Multi-turn simulated Owners in the eval set; plan cases score the first Plan.
- A real tool or MCP server inside the Claude Code session; the search loop lives in core.
- Changing how a plain order is read, matched or picked.
- Saved preferences, payment cards, delivery slots and order history.
- Images in the Plan or the cart.

## Further Notes

- Research: `.scratch/meal-planner/research/llm-shopping-assistants.md`. Option 2 there ("an agent that plans with catalog search and delegates the cart") with the search as a loop in code, products chosen by the planner and confirmed by the Owner, and an LLM router.
- Not verified: whether Carrefour's simulation and cart link work for products of the newly searchable departments (ticket 01); how long a `plan` turn with three search rounds takes on Claude Code (measured by the eval command).
- The tickets land in one release. Each ends with `pnpm check` green and updates the docs it touches.
