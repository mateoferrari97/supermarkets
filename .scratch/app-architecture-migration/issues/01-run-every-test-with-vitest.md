# 01: Run every test with Vitest

**What to build:** `pnpm test` runs every test in `src/` and `scripts/` with Vitest instead of `node:test`, inside `pnpm check`, with the same tests passing. See `.scratch/app-architecture-migration/spec.md` (Toolchain) and ADR 0007.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Vitest added as a dev dependency; `pnpm test` is `vitest run`.
- [x] Vitest `include` is `src/**/*.test.ts` and `scripts/**/*.test.ts`; `.scratch`, `.claude`, `.data` and `.next` are excluded, so test copies under `.claude/worktrees/` never run.
- [x] Every test file imports from `vitest` instead of `node:test`; `node:assert/strict` stays; all test files move together.
- [x] The test-file `no-floating-promises` exception is removed from `eslint.config.js`.
- [x] Any test that now hits Vitest's 5-second default timeout is reported in this ticket and fixed, not hidden by raising the timeout globally.
- [x] `pnpm check` exits 0.

## Comments

- Vitest 5.0.4 installed as a dev dependency; `pnpm test` is `vitest run`, configured in `vitest.config.ts` (`include` set to `src/**/*.test.ts` and `scripts/**/*.test.ts`; `exclude` is Vitest's defaults plus `.scratch/**`, `.claude/**`, `.data/**` and `.next/**`).
- Same tests pass: before the change `tsx --test` reported 135 tests, 135 passed; after it `vitest run` reports 14 test files and 135 tests, all passed.
- All 14 test files changed only their `node:test` import to `vitest` (they import `describe` and `it`); `node:assert/strict` stays. No `scripts/**/*.test.ts` file exists yet.
- Exclusion shown to work: a failing `probe.test.ts` was placed temporarily in `.claude/worktrees/probe/src/`, `.scratch/probe/`, `.data/probe/` and `.next/probe/`; `vitest list --filesOnly` listed none of them and `pnpm test` still reported 14 files and 135 tests passing. The probes were then deleted.
- Timeouts: no test hits Vitest's 5-second default; the slowest test took about 8 ms (Vitest JSON reporter). No timeout was raised.
- `pnpm lint` passes with the test-file `no-floating-promises` exception removed.
- `pnpm check` exits 0.
