---
Status: accepted
---

# Next.js and Vitest on Node 24, running locally only

The Owner's chat is a Next.js 16 app (App Router) started with `pnpm dev` on the Owner's machine; it is not deployed, and the LLM adapter keeps spawning local Claude Code sessions. Vitest replaces `node:test` for every test in `src/` and `scripts/`, run as `vitest run` by `pnpm test` inside `pnpm check`.

Both were checked against this repo's toolchain before choosing them: Next.js 16 needs Node >= 20.9 (https://nextjs.org/docs/app/getting-started/installation) and Vitest needs Node >= 22.12 (https://vitest.dev/guide/migration); both work with ESM, `.ts` extension imports and zod 4. The setup has constraints a reader would not guess:

- `typescript` stays aliased to TypeScript 6, which `next build` and typescript-eslint use (typescript-eslint supports `>=4.8.4 <6.1.0`, https://typescript-eslint.io/users/dependency-versions), while `pnpm typecheck` runs TypeScript 7.
- `next lint` is gone in Next 16 (https://nextjs.org/docs/app/guides/upgrading/version-16), so `eslint .` stays, with `@next/eslint-plugin-next` alone: `eslint-config-next` pulls React, import and a11y plugins that do not declare ESLint 10 support.
- The Next config sets `agentRules: false`, so `next dev` does not write an `AGENTS.md`.
- `.next/` and `next-env.d.ts` are ignored by ESLint, Prettier, git and the no-comments check.
- Vitest sets `include` (its default would also run test copies under `.claude/worktrees/`) and excludes `.scratch`, `.claude`, `.data` and `.next`.
- Async Server Components cannot be tested with Vitest (https://nextjs.org/docs/app/guides/testing/vitest); the conversation logic lives in `core` so it is tested without them.

## Considered Options

- **Keep `node:test`.** It works today, but a second test runner for the app would split `pnpm test`; moving to Vitest is a one-line import change per test file.
- **Deploy the chat (Vercel or elsewhere).** Needs secrets, hosting for the Catalog Snapshot and the LLM through the API; left for a later effort.
- **`eslint-config-next`.** Gives React and a11y rules, at the cost of three plugins without ESLint 10 peer support.
