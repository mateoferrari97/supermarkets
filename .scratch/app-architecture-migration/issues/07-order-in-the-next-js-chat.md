# 07: Order in the Next.js chat

**What to build:** The Owner runs `pnpm dev`, opens the chat, gives a postal code, writes an order, answers the questions with chips or free text, watches the steps run, and gets the cart table with total, notices, unapplied preferences and the link that opens the cart at Carrefour. Closes only after one real order end to end. See `.scratch/app-architecture-migration/spec.md` (Chat, Toolchain) and ADRs 0007 and 0008.

**Blocked by:** 06

**Status:** resolved

- [x] Next.js 16 App Router in `src/app/`; `next.config.ts` with `agentRules: false`; `pnpm dev` runs `next dev`; no `AGENTS.md` is written.
- [x] `@next/eslint-plugin-next` only; `.next/` and `next-env.d.ts` ignored by ESLint, Prettier, git and `scripts/no-comments.ts`; `tsconfig.json` reformatted after Next rewrites it and covering `src/app`; `typescript` stays aliased to TypeScript 6.
- [x] One `POST` route handler per turn streams NDJSON events (session id, step started, step done with seconds, questions, cart, error) and calls `takeTurn` with `request.signal`; the client reads them with `fetch` and `response.body.getReader()`.
- [x] Sessions in a `globalThis` `Map` in a server-only module of `src/app/`; id from `crypto.randomUUID()` kept in React state; deleted on cart, on a failed turn and after one hour idle; 409 for a turn on a session already working; an aborted turn leaves the session as before.
- [x] UI of the chosen prototype variant: numbered questions in one message, option chips plus "cualquiera" appending to the reply, free text, live step list with spinner then seconds, input disabled while working, final cart table (product, what was asked, reason, notices, quantity, unit price, line total), total with postal code and Payment Card, cart notices, unapplied preferences, cart link; no session count, time or cost.
- [x] Invalid data fails with the `compose` loader's message before any order is read.
- [x] Docs updated if 04 is done: `ARCHITECTURE.md` (app and the order codemap), `CLAUDE.md` Commands (`pnpm dev`); `FRONTEND.md` only if a UI convention is set.
- [x] One real order end to end in the chat recorded in this ticket: postal code, order text, questions answered, cart with link.
- [x] `pnpm check` exits 0.

## Comments

- Versions: `next` 16.4.0, `react` and `react-dom` 19.3.0, `@next/eslint-plugin-next` 16.4.0, `@types/react` and `@types/react-dom` 19.3.0, `server-only` 0.0.1. The newest releases (`next` 16.4.1, `react` 19.3.1) were published on 2026-10-14 and pnpm's supply-chain policy only installed them by adding a `minimumReleaseAgeExclude` list to `pnpm-workspace.yaml`, so the previous releases were pinned instead and no exclusion was committed.
- `next dev` reconfigured `tsconfig.json` on first run: `allowJs`, `incremental`, the `.next/types/**/*.ts` and `.next/dev/types/**/*.ts` includes, the `next` plugin, and `jsx: react-jsx`. It was then reformatted with Prettier; `src` already covers `src/app`. No `AGENTS.md` was written with `agentRules: false`.
- `@next/eslint-plugin-next` is applied as its `core-web-vitals` flat config to `src/app/**` only; `pnpm lint` and `pnpm typecheck` (TypeScript 7) pass over the app.
- Questions: core's `optionNames` is now exported so the route handler sends each question's options; the chips append the option text (or "cualquiera") to the reply with ", ", as in prototype variant A.
- `FRONTEND.md` was not written: no UI convention beyond the prototype was set.
- Found while checking in the browser: `scrollIntoView` returned a Promise in the embedded browser, so an effect returning it crashed the page ("destroy is not a function"); the effect now uses a block body.
- Route checks run with `curl` against `pnpm dev`: a reply "hola" to the postal code question answers `"hola" no es un código postal válido.`; an unknown session id answers 404; an invalid body 400; a second `POST` while an order turn runs answers 409 "Todavía estoy trabajando en tu mensaje."; aborting an order turn after 5 s killed its `claude` process (1 running during, 0 after) and the next empty reply on that session answered "¿Qué necesitás del súper?", so the state was the one from before the turn.
- Invalid data: with `vocabulary/carrefour-payment-cards.json` edited to `"bin": "50x"` (restored afterwards with `git checkout`), the page showed "No puedo tomar pedidos: los datos no son válidos." with `payment cards cards.0.bin: Invalid string: must match pattern /^\d{6}$/`, the same line `pnpm payment-cards` prints, and the first `POST /api/turn` answered 500 with that message before any reply was read.

### One real order end to end (2026-10-14)

Run by the agent in Orca's embedded browser against `pnpm dev`, with real Claude Code sessions and the live Carrefour API, and the Catalog Snapshot copied into `.data/carrefour/` from the Owner's main checkout. The Chrome extension was not connected, so the chat was driven through Orca's browser commands (`fill`, and a DOM `click()` on "Enviar" and on the chips, because Orca's `click` on the button did not submit).

1. Postal code: `1425`, accepted; the chat asked "¿Qué necesitás del súper?".
2. Order: "2 leches, pan lactal, yerba Playadito, aceite grande y queso rallado. Pago con Visa Galicia, prefiero ofertas." The step list showed "Entendiendo el pedido 3.0 s" and "Buscando ... en el catálogo" for each of the five Items (3.2 s to 4.3 s).
3. Questions: one message with two numbered questions, "leche" (8 Product Types) and "aceite" (4), each with chips plus "cualquiera". Clicking the chips "Leche entera" and "Aceite vegetal" filled the reply with "Leche entera, Aceite vegetal"; the input was disabled while the turn ran.
4. Asked again: "Para "aceite" (grande), ¿qué tamaño?" with seven size chips; answered with free text "la de 1,5 litros".
5. Steps: "Interpretando tu respuesta 4.2 s", "Traduciendo "prefiero ofertas" a una política 3.8 s", "Carrefour: candidatos para ..." per Item (1.8 s to 4.5 s), "Carrefour: simulando el carrito 0.3 s".
6. Cart: Leche ultra entera Carrefour classic sachet 1 lt. x2, $ 3.553,20; Pan con semillas Oroweat 600 grs x1, $ 7.253,35; Yerba mate Playadito con hierbas 500 g. x1, $ 3.509,00; Aceite de girasol Pureza 1500 cc x1, $ 6.979,00; Queso rallado Carrefour Classic 120 grs x1, $ 4.138,50; each with what was asked and the reason. Total $ 25.433,05 with "CP 1425, Visa Galicia". Cart notice: "No conozco la tarjeta "Visa Galicia": elegí los productos sin sus promociones." No unapplied preferences. Link: `https://www.carrefour.com.ar/checkout/cart/add?sku=143035&qty=2&seller=1&sku=271998&qty=1&seller=1&sku=8630&qty=1&seller=1&sku=14995&qty=1&seller=1&sku=289625&qty=1&seller=1&sc=1`. The link was not opened and nothing was bought.
- Observed, out of this ticket's scope (behaviour of order resolution and product selection is unchanged by the spec): "pan lactal" was filled with "Pan con semillas Oroweat", and "yerba Playadito" with a "con hierbas" variant.
