# LLM

## The LLM translates, code decides

The LLM turns the Owner's words into fixed forms; plain code makes every choice that must be repeatable (ADR 0002, ADR 0011). It splits an order into Items, picks Product Types for an Item from the tree, rewords an Item nothing matched, and maps a free-text answer onto the options offered. Code builds the evidence and the options from the Catalog Snapshot, drops any Product Type id that is not in the tree, and picks the products from live search and checkout simulation with the fixed rules of the Selection Policy (ADR 0003, ADR 0004, ADR 0005). Never let the LLM choose a product, compute a price or invent an option.

## The port and its adapter

- `Llm` in `src/core/order-resolution/llm.ts` is the port: one method per task (`parseOrder`, `fitProducts`, `readReply`, `splitOrder`, `resolveItem`, `rewordItem`, `mapAnswer`) with the input and output types of each call.
- `src/adapters/claude-code/claude-code-llm.ts` implements it by running one Claude Code session per call (`claude -p`) with no tools, a JSON schema for the answer and a budget per session. `TASK_MODELS` fixes the model and effort of each task: `parse-order` and `read-reply` run on `claude-sonnet-5-5` with `--effort low` and `fit-products` on `claude-sonnet-5-5` at its default effort (ADR 0012); the other tasks run on `claude-haiku-5-5` at its default effort until they are deleted. Neither model takes a `temperature`, so the same text can resolve differently between runs.
- `src/adapters/claude-code/llm-output-schemas.ts` holds the zod schemas the answers are parsed with; an answer that does not fit its schema fails the call.
- `src/compose.ts` wires the adapter (`createLlm`); tests use fakes of `Llm` instead.
- The adapter's `onCall` reports every session that returns a result: task, model, effort, SHA-256 of the system prompt, input, raw output, cost and duration. `pnpm order:eval` sums its cost; the chat writes it to the Conversation Log in `.data/conversations/` (see [ARCHITECTURE](../ARCHITECTURE.md#an-order-end-to-end)).

## The `parse-order` task

`parseOrder(orderText, signal)` is call 1 of the order matching flow (ADR 0012), called by the chat for each order. The adapter sends the Owner's text wrapped in `<order>` tags. The LLM returns one line per thing to buy, `{ original, product, brand, size, quantity }`, and `ignoredPreference`, true when the Owner named a payment card or a preference for the whole order (ADR 0011). A card or a preference is never a line.

`size` and `quantity` come back as short strings that `src/core/order-matching/item.ts` parses:

- `size`: `common`, `biggest`, `smallest`, or `<amount> <ml|l|g|kg>` ("2.25 l"), parsed into `{ kind: "exact", dimension, amount }` with the amount in ml or g.
- `quantity`: `minimum`, `<n> unit` with a whole `n`, or `<amount> <g|kg>`, parsed into `{ kind: "units", count }` or `{ kind: "weight", grams }`.

A string the parser rejects, such as "0 kg" or "1.5 unit", fails the call like an answer that does not fit its schema.

## The `fit-products` task

`fitProducts({ item, alsoInThisLine, matches }, signal)` is call 2 of the order matching flow (ADR 0012): one call per Item, which keeps the Item's Fits among its Matches. The adapter sends one `<line>` with `<original>`, `<product>`, `<brand>`, `<also-in-this-line>` (the `product` of the other Items with the same `original`, only when there are any) and `<candidates>`, the Matches numbered from 1 as `number. name | brand | Tipo`.

The LLM returns `{ fits, closest, note, question }`: the numbers of the Matches that fit, a Note for the Owner, and, only when nothing fits, a question with up to 5 `closest` numbers. The schema cannot say how these relate, so the adapter checks that every number is among the Matches, that `question` is set exactly when `fits` is empty, and that `closest` has at most 5 numbers and only when `fits` is empty. A failed check fails the call like an answer that does not fit its schema.

`matchItems` in `src/core/order-matching/match-items.ts` runs the task for a set of Items, at most 10 calls at a time: for each Item it reports the step "Eligiendo productos para '<original>'", searches 30 Matches with `CatalogSearch`, runs the call, and maps the numbers back to products. It returns per Item its Matches, Fits and Note, or its question with the Alternatives in the order the LLM gave them. One call failing fails the whole set, and no further call starts. The chat calls it for each order.

## The `read-reply` task

`readReply({ items, reply }, signal)` is call 1 in follow-up mode (ADR 0012): it reads the Owner's reply to questions or to a cart. `items` holds every Item of the conversation, types in `src/core/order-matching/read-reply.ts`: an asked Item with its `original` and its question (text and Alternatives), or an Item in the cart with its `original` and the product bought. The adapter numbers them from 1 inside `<items>`, each `<item number="n" state="asked|in-cart">` with `<original>` and either `<question>` and `<alternatives>` (numbered from 1 as `number. name | brand`) or `<bought>`, then sends the reply inside `<reply>`. The chat does not call it yet.

The LLM returns `entries`, one per Item the reply touches: `{ item, kind: "choice", alternative }`, `{ item, kind: "lines", lines }` (Items that replace it), `{ item, kind: "drop" }` or `{ item, kind: "unanswered", question }`; plus `newLines` for things the reply adds and `ignoredPreference`. Lines come back as the strings of `parse-order` and are parsed the same way. The adapter checks what the schema cannot: one entry at most per Item, every Item number in the list, every `alternative` among that Item's Alternatives, `choice` only for an asked Item, and `unanswered` for an Item in the cart only with a question (an ambiguous Correction, "¿Cuál coca, la zero o la normal?"). A failed check fails the call. It then adds `{ kind: "unanswered", question: null }` for every asked Item with no entry and returns the entries in Item order, so every asked Item has exactly one.

## Prompts

Each task's system prompt is a Markdown file in `prompts/`, named after the task: `order-matching/parse-order.md`, `order-matching/fit-products.md`, `order-matching/read-reply.md`, and `order-resolution/split-order.md`, `resolve-item.md`, `reword-item.md`, `map-answer.md`. The adapter reads the file on each call; `resolve-item` and `reword-item` get the Product Type tree appended. Prompts are LLM input, written in English; the Owner's text they receive is Spanish. `pnpm docs:check` does not check them.

## Changing a prompt

1. Edit the prompt. If the answer's shape changes, change the output type in the port and its schema in the adapter together.
2. Run `pnpm order:eval` (or `pnpm order:eval <filter>` for the cases whose id or order text contains the filter, and `--runs N` to change the 3 runs per case). It runs each case of the [eval set](#the-eval-set) with real Claude Code sessions and scores the product picked for each Item.
3. Read the report: the totals, each failed case with every run's problems and what each Item came back as, stale ids, the cases that changed since the previous run, and the sessions, time and cost. Each run is saved in `.data/order-matching/eval-runs/` with the Catalog Snapshot's date, so the next run compares against it. The command exits 1 when a case not marked `expectedToFail` fails.
4. When a change fixes a case marked `expectedToFail`, the report says so; clear the mark in the eval set.

## The eval set

`evals/order-matching.json` scores the product picked per Item, not how the order was read. A case runs the flow up to the pick: call 1 (`parse-order`), the search, call 2 (`fit-products`), the size and quantity rule and the Selection Policy on Catalog Snapshot prices, with no checkout simulation, because Branch stock and promotions change between runs. The Catalog Snapshot is not pinned: each run uses the current one and records its date.

An order case has an `id`, the `order`, an optional `expectedToFail` with the reason, an optional `ignoredPreference`, optional `notItems` (words that must not become Items) and its `items`. Each expected Item has a `product` that names it for people and is never compared, its `brand` (null, a name, or the spellings accepted), its `size` kind, its `quantity` as call 1 writes it ("minimum", "2 unit", "300 g"), and either `fits`, every in-stock `productId` that fits, with an optional `pick` (the subset that is a right pick when the size matters), or `alternatives`, the acceptable Alternatives of an Item that must ask. Each expected Item is paired with the Item that came back whose Matches, Fits and Alternatives share most of its products, then the nearest in order.

Metrics, per run and in total:

- Wrong picks nobody sees, the headline: a pick that is not right, with no Note and no question.
- Items read right: `brand`, `size` kind and `quantity` of each Item, plus the number of Items and the `notItems` per run. `product` is not compared.
- Matches recall (expected Fits among the Matches), Fits precision and Fits recall, and pick right.
- Questions asked when they should not, and not asked when they should; Alternatives among the expected ones.
- `ignoredPreference` when the case expects it.
- Stability: an Item is stable when its Fits and pick are the same in every run.
- Sessions, time and cost.

A case passes when, in every run, each expected Item gets a right pick or asks when it should. Recall, precision and stability have no threshold yet. An expected `productId` missing from the Catalog Snapshot or out of stock is reported as stale and left out of the scoring, not failed; an Item whose ids are all stale is not scored.

Cases are labelled by hand: `pnpm order:label <words> [--brand <brand>]` lists the search's top 50 products from the Catalog Snapshot for a phrase, with `productId`, name, brand, size, price and stock. Every `productId` is checked in stock on the current snapshot when the set is written. `pnpm order:eval-set` validates the set with zod (unique ids, non-empty `productId`s with no repeats inside an Item, `pick` within `fits`, either `fits` or `alternatives`, and no order equal to an example `<order>` of `prompts/`) and runs in `pnpm check`; it never reads the Catalog Snapshot. `pnpm order:eval` does not run in `pnpm check`, because it makes live calls and costs money.
