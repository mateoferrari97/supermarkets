# LLM

## The LLM translates, code decides

The LLM turns the Owner's words into fixed forms; plain code makes every choice that must be repeatable (ADR 0002, ADR 0011). It reads an order into Items, keeps the Fits of an Item among the Matches code found for it, and reads the Owner's reply to questions or a cart (ADR 0012). Code searches the Catalog Snapshot for the Matches, checks every number the LLM returns is among them, applies the size and quantity rule, and picks the products from checkout simulation with the fixed rules of the Selection Policy (ADR 0011). Never let the LLM choose a price, compute a quantity or invent a product.

## The port and its adapter

- `Llm` in `src/core/order-matching/llm.ts` is the port: one method per task (`parseOrder`, `fitProducts`, `readReply`) with the input and output types of each call.
- `src/adapters/claude-code/claude-code-llm.ts` implements it by running one Claude Code session per call (`claude -p`) with no tools, a JSON schema for the answer and a budget per session. `TASK_MODELS` fixes the model and effort of each task: `parse-order` and `read-reply` run on `claude-sonnet-5-5` with `--effort low` and `fit-products` on `claude-sonnet-5-5` at its default effort (ADR 0012). The model takes no `temperature`, so the same text can resolve differently between runs.
- `src/adapters/claude-code/llm-output-schemas.ts` holds the zod schemas the answers are parsed with; an answer that does not fit its schema fails the call; the `size` and `quantity` of a line are built from the patterns and parsers of `src/core/order-matching/item.ts`, so the JSON schema sent to Claude Code carries the same patterns the parser reads.
- The checks of an answer against its input, for `fit-products` and `read-reply`, run in core, not in the adapter (ADR 0006): the adapter keeps the prompts, the output schemas and the parsing of lines, and core calls the port through `checkedFitProducts` and `checkedReadReply`.
- `src/compose.ts` wires the adapter (`createLlm`); tests use fakes of `Llm` instead.
- The adapter's `onCall` reports every session that returns a result: task, model, effort, SHA-256 of the system prompt, input, raw output, cost and duration. `pnpm order:eval` sums its cost; the chat writes it to the Conversation Log in `.data/conversations/` (see [ARCHITECTURE](../ARCHITECTURE.md#an-order-end-to-end)).

## The `parse-order` task

`parseOrder(orderText, signal)` is call 1 of the order matching flow (ADR 0012), called by the chat for each order. The adapter sends the Owner's text wrapped in `<order>` tags. The LLM returns one line per thing to buy, `{ original, product, brand, size, quantity }`, and `ignoredPreference`, true when the Owner named a payment card or a preference for the whole order (ADR 0011). A card or a preference is never a line.

`size` and `quantity` come back as short strings that `src/core/order-matching/item.ts` parses:

- `size`: `common`, `biggest`, `smallest`, or `<amount> <ml|l|g|kg>` ("2.25 l"), parsed into `{ kind: "exact", dimension, amount }` with the amount in ml or g.
- `quantity`: `minimum`, `<n> unit` with a whole `n`, or `<amount> <g|kg>`, parsed into `{ kind: "units", count }` or `{ kind: "weight", grams }`.

Amounts are rounded to thousandths of ml or g by `roundMeasure`, the same rounding the Catalog Snapshot sizes and the Candidates use. A string the parser rejects, such as "0 kg", "0.0001 g" or "1.5 unit", fails the line schema, so the call fails like any answer that does not fit its schema. `src/core/order-matching/item-line-cases.ts` lists every accepted and rejected format; the Item tests and the line schema tests both run it.

## The `fit-products` task

`fitProducts({ item, alsoInThisLine, matches }, signal)` is call 2 of the order matching flow (ADR 0012): one call per Item, which keeps the Item's Fits among its Matches. The adapter sends one `<line>` with `<original>`, `<product>`, `<brand>`, `<also-in-this-line>` (the `product` of the other Items with the same `original`, only when there are any) and `<candidates>`, the Matches numbered from 1 as `number. name | brand | Tipo`.

The LLM returns `{ fits, closest, note, question }`: the numbers of the Matches that fit, a Note for the Owner, and, only when nothing fits, a question with up to 5 `closest` numbers. The schema cannot say how these relate, so core checks the answer against its input in `checkFitProducts` (`src/core/order-matching/match-items.ts`): every number is among the Matches, `question` is set exactly when `fits` is empty, and `closest` has at most 5 numbers and only when `fits` is empty. `matchItems` calls the port only through `checkedFitProducts`, so every adapter and every test fake goes through the same checks. A broken rule throws an error that names the task, the Item and the rule, such as `fit-products answer for Item "una cerveza" breaks a rule: no Alternatives while products fit`, and the turn ends with it.

`matchItems` in `src/core/order-matching/match-items.ts` runs the task for a set of Items, at most 10 calls at a time: for each Item it reports the step "Eligiendo productos para '<original>'", searches 30 Matches with `CatalogSearch`, runs the call, and maps the numbers back to products. It returns per Item its Matches, Fits and Note, or its question with the Alternatives in the order the LLM gave them. One call failing fails the whole set, and no further call starts. The chat calls it for each order.

## The `read-reply` task

`readReply({ items, reply }, signal)` is call 1 in follow-up mode (ADR 0012): it reads the Owner's reply to questions or to a cart. `items` holds every Item of the conversation, types in `src/core/order-matching/read-reply.ts`: an asked Item with its `original` and its question (text and Alternatives), or an Item in the cart with its `original` and the product bought. The adapter numbers them from 1 inside `<items>`, each `<item number="n" state="asked|in-cart">` with `<original>` and either `<question>` and `<alternatives>` (numbered from 1 as `number. name | brand`) or `<bought>`, then sends the reply inside `<reply>`. `takeTurn` calls it for every reply to open questions, with the asked Items only; it does not send Items in the cart yet.

The LLM returns `entries`, one per Item the reply touches: `{ item, kind: "choice", alternative }`, `{ item, kind: "lines", lines }` (Items that replace it), `{ item, kind: "drop" }` or `{ item, kind: "unanswered", question }`; plus `newLines` for things the reply adds and `ignoredPreference`. Lines come back as the strings of `parse-order` and are parsed the same way. The adapter only parses the lines. Core checks what the schema cannot in `checkReadReply` (`src/core/order-matching/read-reply.ts`): one entry at most per Item, every Item number in the list, every `alternative` among that Item's Alternatives, `choice` only for an asked Item, and `unanswered` for an Item in the cart only with a question (an ambiguous Correction, "¿Cuál coca, la zero o la normal?"). A broken rule throws an error that names the task, the Item and the rule, such as `read-reply answer for Item 2 ("coca cola zero grande") breaks a rule: a choice only for an asked Item`. It then adds `{ kind: "unanswered", question: null }` for every asked Item with no entry and returns the entries in Item order, so every asked Item has exactly one. `takeTurn` and the eval set's answer cases call the port only through `checkedReadReply`, so they and every test fake go through the same checks.

## Prompts

Each task's system prompt is a Markdown file in `prompts/`, named after the task: `order-matching/parse-order.md`, `order-matching/fit-products.md`, and `order-matching/read-reply.md`. The adapter reads the file on each call. Prompts are LLM input, written in English; the Owner's text they receive is Spanish. `pnpm docs:check` does not check them.

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

An answer case, under `answers`, runs only `read-reply` (`src/core/order-matching/eval-answers.ts`). It has an `id`, an optional `expectedToFail`, the fixed `items` of the conversation (an asked Item with its `original`, `question` and `alternatives` by `productId`, or an Item in the cart with its `original` and the `productId` it `bought`), the Owner's `reply`, the expected `entries` (`choice` with its Alternative number, `lines` with `product` and `brand`, `drop`, `unanswered`, which for an Item in the cart stands for an ambiguous Correction asked back; every asked Item has one, Items in the cart only when the reply touches them), the expected `newLines` and an optional `ignoredPreference`. The products are read from the Catalog Snapshot to build the input. A line matches when every word of the expected `product` is in the line's `product` and the `brand` is the same, both ignoring case and accents. An answer case passes when every run gives exactly the expected entries, `newLines` and `ignoredPreference`; the report prints how many passed and the differences of each one that failed.

Cases are labelled by hand: `pnpm order:label <words> [--brand <brand>]` lists the search's top 50 products from the Catalog Snapshot for a phrase, with `productId`, name, brand, size, price and stock. Every `productId` is checked in stock on the current snapshot when the set is written. `pnpm order:eval-set` validates the set with zod (unique ids, non-empty `productId`s with no repeats inside an Item, `pick` within `fits`, either `fits` or `alternatives`, no order equal to an example `<order>` of `prompts/`, and for answer cases one expected entry at most per Item, one for every asked Item, Item and Alternative numbers in range, and `choice` only for asked Items) and runs in `pnpm check`; it never reads the Catalog Snapshot. `pnpm order:eval` does not run in `pnpm check`, because it makes live calls and costs money.
