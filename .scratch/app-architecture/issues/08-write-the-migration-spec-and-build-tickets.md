# 08: Write the migration spec and build tickets

Type: task
Status: resolved
Blocked by: 01, 02, 03, 04, 05, 06, 07, 10, 11

## Question

Write the ADRs for the decisions above, and the migration spec at `.scratch/app-architecture-migration/spec.md` sliced into build tickets in its `issues/`, so execution can start with nothing left to decide.

## Answer

Written in this session; `pnpm check` exits 0 afterwards.

ADRs, one per lasting decision of this map, none citing `.scratch/`:

- `docs/adr/0006-layers-as-rings-with-features-inside-the-core.md`: from [Layers and dependency rule](01-layers-and-dependency-rule.md) and [Surviving operator scripts](04-surviving-operator-scripts.md).
- `docs/adr/0007-next-js-and-vitest-on-node-24-running-locally.md`: from [Toolchain compatibility](02-toolchain-compatibility.md) and the map's Notes.
- `docs/adr/0008-the-owner-orders-in-a-local-chat-that-replaces-the-order-command.md`: from [Chat flow](03-chat-flow.md), [Chat plumbing](10-chat-plumbing.md) and [Migration order](11-migration-order.md).
- `docs/adr/0009-claude-md-is-a-short-map-into-a-content-first-docs-folder.md`: from [Docs layout](05-docs-layout.md), [ExecPlan format](06-execplan-format.md) and [Mechanical docs checks](07-mechanical-docs-checks.md).
- `docs/adr/0010-check-the-knowledge-base-mechanically-in-pnpm-check.md`: from [Mechanical docs checks](07-mechanical-docs-checks.md).

Spec: `.scratch/app-architecture-migration/spec.md`, with the seven build tickets of [Migration order](11-migration-order.md) as `issues/01` to `issues/07` (A to G in that order), all `ready-for-agent`: 01 Vitest and 02 the layer move start now; 03 the ESLint rule after 02; 04 docs and `pnpm docs` after 01 and 03; 05 `src/cli/` after 03; 06 `takeTurn` and removing `pnpm order` after 01 and 05; 07 the chat after 06.

Two gaps settled with the Owner while writing:

- Postal code: [Chat flow](03-chat-flow.md) said the postal code is asked last when missing, but it predates the postal code spec, which asks and checks it before the order is read. The Owner chose the latter: the chat opens by asking for the postal code, checks it with Carrefour, and only then asks for the order.
- Cart: besides the table and total of [Chat flow](03-chat-flow.md), the chat shows the cart's notices, the preferences no rule could apply and the cart link, as `pnpm order` prints today.

Found while writing and folded into the tickets: `src/product-selection/postal-code.ts` was not placed by [Layers and dependency rule](01-layers-and-dependency-rule.md) and goes to `core/product-selection`; ADR 0001 (catalog data) and ADR 0002 (Thinking Machines result) also cite `.scratch/`, not only Carrefour API facts, so ticket 04 repoints them too; `.claude/skills/seed-product-types/SKILL.md` cites `docs/product-type-seed-rules.md` twice and ticket 04 updates it.
