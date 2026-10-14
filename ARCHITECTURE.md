# Architecture

## The product

The Owner writes a supermarket order in free Spanish ("necesito leche, dos cocas grandes y nada de huevos") and gets a Carrefour cart they only have to open and pay. The Assistant asks for the postal code, splits the order into Items, resolves each Item to Product Types of its own vocabulary with an LLM over evidence from the Catalog Snapshot, asks the Owner every open question in one message, and then picks one product per Item from Carrefour's live search and checkout simulation with the fixed rules of a Selection Policy. The LLM translates; code decides ([LLM](docs/LLM.md)). Terms are defined in [GLOSSARY.md](GLOSSARY.md); the decisions are in [docs/adr/](docs/adr/README.md).

## Layers

The code is one package with the layers of ADR 0006 at the top and features inside the core.

- `src/core/<feature>/`: domain rules, use cases and port types of one feature. It imports only `core` and zod.
  - `src/core/catalog/`: text normalization, sizes in product names and brand matching.
  - `src/core/order-resolution/`: from the order text to resolved Items and questions; the `Llm` port; the eval set and its scoring.
  - `src/core/product-selection/`: from resolved Items to a cart; the `OnlineStore` port; Payment Cards and postal codes.
  - `src/core/product-types/`: the schema and validation of the Product Type vocabulary and the Carrefour Tipo mapping.
  - `src/core/product-type-seed/`: splitting Carrefour's Tipos into parts, checking classification proposals, consolidating them into the vocabulary, coverage and the remaining doubts.
- `src/adapters/<technology>/`: implementations of the ports. They import `core`, `node:*` and zod.
  - `src/adapters/carrefour/`: `OnlineStore` over Carrefour's public API ([Carrefour API](docs/references/carrefour-api.md)) and the conversion of Catalog Snapshot records.
  - `src/adapters/claude-code/`: `Llm` over local Claude Code sessions, and the zod schemas that parse their answers.
- `src/compose.ts`: the composition root. It wires adapters into the ports (`createLlm`, `createOnlineStore`) and imports only `core` and `adapters`.
- `scripts/`: the operator commands, which read and write files directly today, and the repo tooling (`format.mjs`, `no-comments.ts`, `check-docs.ts`). The operator commands move into a `cli` delivery layer and the files into an adapter in a later step of the migration; the chat (`app`) comes after that.

## Ports and the dependency rule

Only two things vary per adapter, so only they are ports (ADR 0006):

- `Llm` (`src/core/order-resolution/llm.ts`): split an order, resolve an Item, reword an Item, map an answer, translate a preference.
- `OnlineStore` (`src/core/product-selection/online-store.ts`): check delivery to a postal code, find candidates, simulate a cart, build the cart link.

Static data (Catalog Snapshot, vocabulary, mapping, Payment Cards, eval set) has no port: it is loaded outside `core` and passed in as arguments. ESLint's `no-restricted-imports` in `eslint.config.js` enforces the rule in `pnpm lint`: `core` imports only `core` and zod; adapters import `core`, `node:*` and zod; `compose` imports `core` and adapters; `cli` and `app` never import adapters. Imports between features inside `core` are free.

## An order end to end

Today an order runs in the terminal with `pnpm order` (`scripts/order.ts`):

1. **Postal code.** `postalCodeFrom` (`src/core/product-selection/postal-code.ts`) reads the code from the Owner's text; `OnlineStore.checkDelivery` asks Carrefour's regions endpoint (`src/adapters/carrefour/carrefour-store.ts`) whether it delivers there. A refusal asks again.
2. **Data.** `readOrderData` (`scripts/order-files.ts`) loads the Catalog Snapshot's grocery products, the vocabulary, the Tipo mapping and the Payment Cards.
3. **Resolver.** `createOrderResolver` (`src/core/order-resolution/resolve-order.ts`) builds a BM25 index (`src/core/order-resolution/bm25.ts`) over the names of the products whose Tipo is mapped to a Product Type.
4. **Split.** `resolveOrder` calls `Llm.splitOrder`, which turns the text into Items (phrase, quantity, terms, vague words, brand), the Payment Card and the preference.
5. **Resolve each Item.** The BM25 evidence and the Item go to `Llm.resolveItem`, which answers `match`, `ambiguous` or `none` with Product Type ids; code drops unknown ids. `none` is retried once with `Llm.rewordItem`. Code then checks the Item's terms against product names and builds size options for vague words from the Catalog Snapshot (`src/core/catalog/catalog.ts`).
6. **Questions.** Every open doubt becomes one numbered message. `answerQuestions` maps the Owner's free-text answer onto the options with `Llm.mapAnswer` and asks again what still does not match.
7. **Pick.** `pickProducts` (`src/core/product-selection/pick-products.ts`) translates the preference into a Selection Policy with `Llm.translatePreference`, finds the Payment Card (`src/core/product-selection/payment-cards.ts`), and for each Item asks `OnlineStore.findCandidates` for available products of the mapped Tipos in the Owner's region, simulates the first candidates one by one with `OnlineStore.simulate`, and ranks them with the policy. When search finds nothing it falls back to Catalog Snapshot products.
8. **Cart.** The whole cart is simulated again; an unavailable product is replaced by the Item's next candidate. `OnlineStore.cartLink` builds the link, and the script prints each line, the notices, the preferences no rule could apply, the total and the link.

## Data

| Folder | What it holds | Who writes it | Who validates it | Committed |
| --- | --- | --- | --- | --- |
| `vocabulary/` | `product-types.json` (Product Type Groups and Product Types), `carrefour-tipos.json` (Carrefour Tipo to Product Type id, `null` for excluded), `carrefour-payment-cards.json` (Payment Card names to payment system and BIN) | `pnpm seed:consolidate` writes the first two from the seed proposals and decisions; the Payment Cards are edited by hand | `pnpm product-types` and `pnpm payment-cards`, in `pnpm check` | Yes |
| `evals/` | `order-resolution.json`, the Owner's eval set: orders and what each must resolve to | By hand | `pnpm order:eval-set`, in `pnpm check` | Yes |
| `prompts/` | `order-resolution/<task>.md`, the system prompt of each `Llm` task | By hand ([LLM](docs/LLM.md#changing-a-prompt)) | Measured by `pnpm order:eval`; not checked by `pnpm docs:check` | Yes |
| `.data/` | `carrefour/products.json` and `carrefour/tipos.json` (the Catalog Snapshot), `carrefour/seed/` (parts, proposals, decisions, doubts, summary), `order-resolution/eval-runs/` (one file per eval run) | `pnpm carrefour:catalog`, the `seed:*` commands and the seed skills, `pnpm order:eval` | No validator command; the commands parse the Catalog Snapshot and the seed decisions with zod when they read them | No (`.gitignore`) |
