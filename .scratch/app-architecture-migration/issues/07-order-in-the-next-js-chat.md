# 07: Order in the Next.js chat

**What to build:** The Owner runs `pnpm dev`, opens the chat, gives a postal code, writes an order, answers the questions with chips or free text, watches the steps run, and gets the cart table with total, notices, unapplied preferences and the link that opens the cart at Carrefour. Closes only after one real order end to end. See `.scratch/app-architecture-migration/spec.md` (Chat, Toolchain) and ADRs 0007 and 0008.

**Blocked by:** 06

**Status:** ready-for-agent

- [ ] Next.js 16 App Router in `src/app/`; `next.config.ts` with `agentRules: false`; `pnpm dev` runs `next dev`; no `AGENTS.md` is written.
- [ ] `@next/eslint-plugin-next` only; `.next/` and `next-env.d.ts` ignored by ESLint, Prettier, git and `scripts/no-comments.ts`; `tsconfig.json` reformatted after Next rewrites it and covering `src/app`; `typescript` stays aliased to TypeScript 6.
- [ ] One `POST` route handler per turn streams NDJSON events (session id, step started, step done with seconds, questions, cart, error) and calls `takeTurn` with `request.signal`; the client reads them with `fetch` and `response.body.getReader()`.
- [ ] Sessions in a `globalThis` `Map` in a server-only module of `src/app/`; id from `crypto.randomUUID()` kept in React state; deleted on cart, on a failed turn and after one hour idle; 409 for a turn on a session already working; an aborted turn leaves the session as before.
- [ ] UI of the chosen prototype variant: numbered questions in one message, option chips plus "cualquiera" appending to the reply, free text, live step list with spinner then seconds, input disabled while working, final cart table (product, what was asked, reason, notices, quantity, unit price, line total), total with postal code and Payment Card, cart notices, unapplied preferences, cart link; no session count, time or cost.
- [ ] Invalid data fails with the `compose` loader's message before any order is read.
- [ ] Docs updated if 04 is done: `ARCHITECTURE.md` (app and the order codemap), `CLAUDE.md` Commands (`pnpm dev`); `FRONTEND.md` only if a UI convention is set.
- [ ] One real order end to end in the chat recorded in this ticket: postal code, order text, questions answered, cart with link.
- [ ] `pnpm check` exits 0.
