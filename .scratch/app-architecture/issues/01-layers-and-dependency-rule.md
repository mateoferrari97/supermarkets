# 01: Layers and dependency rule

Type: grilling
Status: resolved
Blocked by: none

## Question

Which layers does the app have (domain, application/use cases, ports, adapters, delivery), where does each current module in `src/` and `scripts/` land, is it one package or a pnpm monorepo, and how is the dependency rule enforced mechanically in `pnpm check` (for example eslint boundaries or dependency-cruiser)?

## Answer

Decided with the Owner in a grilling session. Community guidance was checked first: Next.js is unopinionated about structure (https://nextjs.org/docs/app/getting-started/project-structure); Node.js Best Practices recommends components by business domain with layers inside (https://github.com/goldbergyoni/nodebestpractices/blob/master/sections/projectstructre/breakintcomponents.md); clean or hexagonal Next.js layouts are community posts with no consensus. Classic separate layers (`domain/`, `application/`, `ports/`, ...) were rejected: `resolve-order` is domain and use case at once, and splitting it yields shallow pass-through modules.

Shape:

- One pnpm package, not a monorepo.
- Layers at the top, features inside the core: `src/core/<feature>/` (one ring: domain rules, use cases and port types, no split between domain and application), `src/adapters/<technology>/`, `src/compose.ts` (the single composition root), `src/cli/` (operator commands), `src/app/` (Next.js).
- `scripts/` holds only repo tooling (`format.mjs`, `no-comments.ts`, future docs checks), outside the architecture and its dependency rule.
- Tests sit next to the file they test.

Dependency rule, enforced with ESLint's built-in `no-restricted-imports` in `pnpm check` (no new dependency):

- `core` imports only `core` and zod.
- `adapters` import `core`, `node:*` and zod.
- `compose` imports `core` and `adapters`.
- `cli` and `app` import `core` and `compose`, never `adapters`.
- Imports between features inside `core` are free; no per-feature rule.

Ports:

- Only where an adapter really varies: `Llm` and `OnlineStore`.
- Static data (Catalog Snapshot, Product Types, Payment Cards, eval set) is loaded by `adapters/files` and passed to `core` as arguments, with no port interface; `cli` and `app` reach it through `compose`.
- A port file holds the port and the input and output types of that conversation only; glossary concepts used in its signature live in their own `core` files.
- zod is allowed in `core` for schemas of domain data (vocabulary, mapping, eval set, proposal, Payment Cards); schemas that parse LLM output live in `adapters/claude-code`.

Where current code lands:

- `core/catalog/`: `text.ts`, `catalog.ts` (moved out of order resolution, since product selection uses them too).
- `core/order-resolution/`: `resolve-order`, `bm25`, `eval-set`, and `llm.ts` split into the `Llm` port with its input and output types and a concepts file (`Item`, `SelectionPolicy`, `Evidence`).
- `core/product-selection/`: `pick-products`, `payment-cards`, and `store.ts` split into the `OnlineStore` port with its types and a concepts file (`PaymentCard`, `Measure`).
- `core/product-types/`, `core/product-type-seed/`: as today.
- `adapters/carrefour/`: `carrefour-store`, `snapshotProducts`, and the download logic of `scripts/carrefour-catalog.ts`.
- `adapters/claude-code/`: `claude-code-llm` and the LLM output schemas.
- `adapters/files/`: what `scripts/order-files.ts` and `scripts/seed-files.ts` do today.
- Which operator commands survive is decided in 04; the chat's behaviour in 03.
