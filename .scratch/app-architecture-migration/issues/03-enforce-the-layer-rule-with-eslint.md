# 03: Enforce the layer rule with ESLint

**What to build:** `pnpm lint` fails when an import breaks the dependency rule of ADR 0006, and nothing in the repo breaks it. See `.scratch/app-architecture-migration/spec.md` (Dependency rule).

**Blocked by:** 02

**Status:** resolved

- [x] `eslint.config.js` uses the built-in `no-restricted-imports`: `core` imports only `core` and zod; `adapters` import `core`, `node:*` and zod; `compose` imports `core` and `adapters`; `cli` and `app` import `core` and `compose`, never `adapters`.
- [x] Imports between features inside `core` stay free; `scripts/` is outside the rule.
- [x] Every violation found is fixed by moving code, not by an `eslint-disable` (for example, anything in `core` reading files or spawning processes moves to an adapter).
- [x] Shown to work: a temporary import of `src/adapters/` from `src/core/` fails `pnpm lint` with the rule's message (noted in this ticket, then removed).
- [x] `pnpm check` exits 0.

## Comments

- `eslint.config.js` has one `no-restricted-imports` block per layer, each an allowlist written as a single negative-lookahead `regex` pattern with `caseSensitive: true`:
  - `src/core/**`: `zod`, `./…`, `../<feature>/…` and `../../core/…`. Message: "core imports only core and zod (ADR 0006)."
  - `src/adapters/**`: `zod`, `node:*`, `./…` (the same adapter) and `../../core/…`. One adapter importing another is rejected, since the rule lists only `core`, `node:*` and zod. Message: "adapters import only core, node:* and zod (ADR 0006)."
  - `src/compose.ts`: `./core/…` and `./adapters/…`. Message: "compose imports only core and adapters (ADR 0006)."
  - `src/cli/**` and `src/app/**`: any import with an `adapters` path segment is rejected. Message: "cli and app import core and compose, never adapters (ADR 0006)." This is a denylist, not an allowlist, so `next`, `react` and the `process` global stay usable; "cli never imports `node:fs`" is ticket 05.
- Test files: the spec keeps `vitest` and `node:assert/strict` in tests that sit next to the code they test, so `src/core/**/*.test.ts` also allows `vitest` and `node:assert/strict`, and `src/adapters/**/*.test.ts` also allows `vitest`. Nothing else is added for tests.
- `scripts/` and the root config files are outside every layer block. Imports between features inside `core` stay free: `pick-products.ts` imports `../order-resolution/…` and passes.
- Violation found and fixed: `src/core/product-selection/payment-cards.test.ts` read `vocabulary/carrefour-payment-cards.json` with `node:fs` ("parses the committed table"). That test moved to `scripts/order-files.test.ts`, next to the loader that owns `PAYMENT_CARDS_PATH`, and reads the file through `readJson`; ticket 05 moves it with `order-files.ts` into `adapters/files`. `pnpm test`: "Test Files 15 passed (15), Tests 135 passed (135)", the same 135 tests as before. No `eslint-disable` was added.
- Shown to work on 2026-10-14 with temporary files, removed afterwards. `pnpm lint` exited 1 with exactly these 5 errors:
  - `src/core/catalog/layer-probe.ts` importing `../../adapters/carrefour/carrefour-store.ts`: "'../../adapters/carrefour/carrefour-store.ts' import is restricted from being used by a pattern. core imports only core and zod (ADR 0006)".
  - `src/core/catalog/layer-probe-2.ts` importing `node:fs`: "core imports only core and zod (ADR 0006)".
  - `src/adapters/claude-code/layer-probe.ts` importing `../../compose.ts` and `../carrefour/carrefour-store.ts`: "adapters import only core, node:* and zod (ADR 0006)" for each.
  - `src/cli/layer-probe.ts` importing `../adapters/carrefour/carrefour-store.ts`, `../compose.ts` and `../core/…`: only the adapters import failed, with "cli and app import core and compose, never adapters (ADR 0006)".
- Not covered: `no-restricted-imports` does not check dynamic `import()` calls; no file in `src/` uses one (checked with `grep`).
- `pnpm check` exits 0.
