# 01: Run every test with Vitest

**What to build:** `pnpm test` runs every test in `src/` and `scripts/` with Vitest instead of `node:test`, inside `pnpm check`, with the same tests passing. See `.scratch/app-architecture-migration/spec.md` (Toolchain) and ADR 0007.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Vitest added as a dev dependency; `pnpm test` is `vitest run`.
- [ ] Vitest `include` is `src/**/*.test.ts` and `scripts/**/*.test.ts`; `.scratch`, `.claude`, `.data` and `.next` are excluded, so test copies under `.claude/worktrees/` never run.
- [ ] Every test file imports from `vitest` instead of `node:test`; `node:assert/strict` stays; all test files move together.
- [ ] The test-file `no-floating-promises` exception is removed from `eslint.config.js`.
- [ ] Any test that now hits Vitest's 5-second default timeout is reported in this ticket and fixed, not hidden by raising the timeout globally.
- [ ] `pnpm check` exits 0.
