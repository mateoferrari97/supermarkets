# 03: Enforce the layer rule with ESLint

**What to build:** `pnpm lint` fails when an import breaks the dependency rule of ADR 0006, and nothing in the repo breaks it. See `.scratch/app-architecture-migration/spec.md` (Dependency rule).

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] `eslint.config.js` uses the built-in `no-restricted-imports`: `core` imports only `core` and zod; `adapters` import `core`, `node:*` and zod; `compose` imports `core` and `adapters`; `cli` and `app` import `core` and `compose`, never `adapters`.
- [ ] Imports between features inside `core` stay free; `scripts/` is outside the rule.
- [ ] Every violation found is fixed by moving code, not by an `eslint-disable` (for example, anything in `core` reading files or spawning processes moves to an adapter).
- [ ] Shown to work: a temporary import of `src/adapters/` from `src/core/` fails `pnpm lint` with the rule's message (noted in this ticket, then removed).
- [ ] `pnpm check` exits 0.
