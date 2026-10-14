# 06: Hold the order conversation in core and remove pnpm order

**What to build:** The whole conversation of `scripts/order.ts` (postal code first, order text, questions, product selection) is `takeTurn` in `src/core/order-conversation/`, reporting typed progress through `onStep` and stoppable through an `AbortSignal` that reaches every call of both ports. `pnpm order` is removed. See `.scratch/app-architecture-migration/spec.md` (Conversation) and ADR 0008.

**Blocked by:** 01, 05

**Status:** ready-for-agent

- [ ] `takeTurn(state, replyText, deps, onStep) → { state, reply }`: a new conversation asks "¿A qué código postal es el envío?"; the postal code is parsed with `postalCodeFrom` and checked with `checkDelivery`, refused with today's texts and asked again; once accepted, the next reply is the order text; then the open questions; once nothing is left to ask, the reply is the Product Selection.
- [ ] The step event type lives in `core/order-conversation` with typed kinds (understanding the order, searching each Item, translating the preference, Carrefour candidates, simulating the cart, each started and done).
- [ ] Every method of `Llm` and `OnlineStore` takes an `AbortSignal`; the Claude Code adapter kills its child process on abort and the Carrefour adapter passes it to `fetch`; both tested.
- [ ] `takeTurn` tested with fakes of both ports: postal code missing, rejected, not served and accepted; order with and without questions; unclear answers asked again; product selection reached; `onStep` events in order; an aborted turn leaving the state as before.
- [ ] `order:eval` keeps working without `onStep`.
- [ ] `scripts/order.ts` and the `order` script removed; `CLAUDE.md` and `ARCHITECTURE.md` updated if 04 is done.
- [ ] If a domain term emerges for the conversation, it is added to `GLOSSARY.md`.
- [ ] `pnpm check` exits 0.
