# 02: Toolchain compatibility

Type: research
Status: resolved
Blocked by: none

## Question

Does the current Next.js release work with this repo's toolchain: Node 24, ESM, TypeScript 6 (`@typescript/typescript6`) and `typescript7`, `.ts` extension imports, ESLint 10 flat config, Prettier, zod 4? Does Vitest run the same setup, and what breaks when moving the existing `node:test` suites (including `scripts/**/*.test.ts`) to Vitest? Cite primary sources.

## Answer

Findings on branch `research/toolchain-compatibility` (`.scratch/app-architecture/research/toolchain-compatibility.md`), verified by building a throwaway copy of the repo with Next added.

Yes: Next.js 16.4.1 and Vitest 5.0.4 work with this toolchain.

- Node 24 and ESM: production builds (Turbopack and webpack) and `next dev` work with `"type": "module"` and `next.config.ts`. Next needs Node >= 20.9 (https://nextjs.org/docs/app/getting-started/installation).
- TypeScript: `next build` type-checks with the project's own `tsc` CLI (https://nextjs.org/docs/app/api-reference/config/next-config-js/useTypeScriptCli), which resolves to TS 6 through the `typescript` alias, while `pnpm typecheck` stays on TS 7. The alias must stay: TS 7 has no JS API and typescript-eslint supports TypeScript `>=4.8.4 <6.1.0` (https://typescript-eslint.io/users/dependency-versions).
- `tsconfig.json`: Next rewrites it once (`jsx`, `plugins`, `allowJs`, `incremental`, `.next/types`), which must then be reformatted for Prettier; `app` must be added to `include` by hand.
- `.ts` extension imports work in Turbopack, webpack and dev; verified by running, not documented by Next.
- ESLint 10: `next lint` is gone in Next 16, so `eslint .` stays (https://nextjs.org/docs/app/guides/upgrading/version-16). `eslint-config-next` pulls `eslint-plugin-react`, `eslint-plugin-import` and `eslint-plugin-jsx-a11y`, which do not declare ESLint 10 peer support (pnpm warns) though their rules fired in a sample. `@next/eslint-plugin-next` alone avoids them.
- `.next/` and `next-env.d.ts` must be ignored by ESLint, Prettier, git and the no-comments check (`next-env.d.ts` is generated and has comments).
- `next dev` writes an `AGENTS.md` unless `agentRules: false` is set in the Next config; the map rules out `AGENTS.md`.
- Installing Next added release-age exceptions to `pnpm-workspace.yaml`. zod 4: no conflict.
- Vitest: runs with no config file; needs Node >= 22.12 (https://vitest.dev/guide/migration). All 12 test files fail as-is ("No test suite found"); changing `from "node:test"` to `from "vitest"` is the whole migration and all 117 tests pass with `node:assert/strict`. No `node:test` mocks, hooks, context, `.only` or `skip` are used. The test-file `no-floating-promises` exception becomes unnecessary. No `scripts/**/*.test.ts` exist today. Vitest excludes only `node_modules` and `.git` by default (https://vitest.dev/config/exclude), so `.scratch`, `.claude`, `.data` and `.next` need excluding. Async Server Components are not supported by Vitest (https://nextjs.org/docs/app/guides/testing/vitest).
- Unknown: whether every rule of the three React/import/a11y ESLint plugins works on ESLint 10; Next's TS editor plugin under TS 7; `next build` type-checking with TS 7; React component tests in Vitest.
- Addendum from a second, agreeing note on branch `research/toolchain-compatibility-2` (based on `5951a7a`, 14 test files and 135 tests, all passing after the import change): Vitest's default include also finds test copies under `.claude/worktrees/`, so `include` must be set; the per-test timeout drops from none to 5 seconds; the script must be `vitest run`, since bare `vitest` watches and would hang `pnpm check`; all test files migrate together. Next's missing `app` entry in `include` makes ESLint fail on a new page until added. Open issue on ESLint 10 support: jsx-eslint/eslint-plugin-react#3977.
