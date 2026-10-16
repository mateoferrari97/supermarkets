# 11: The agent chat becomes the only chat

**What to build:** The agent chat replaces today's chat at the root page, and everything it replaced is deleted: the state machine and its stages, the Topic router, the order reading and reply reading tasks, the in-memory sessions, and the order and planning eval sets with their commands, moving any case worth keeping into the agent eval set. **Topic** leaves the glossary.

**Blocked by:** 06, 07, 08, 09, 10

**Status:** ready-for-agent

- [x] No code, prompt or command of the old flow remains
- [x] `pnpm check` and the Commands of `CLAUDE.md` list only the agent eval set
- [x] `ARCHITECTURE.md`, `docs/LLM.md` and `docs/TESTING.md` describe only the agent
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

**Deleted**
- Core: `src/core/order-conversation/` (`takeTurn`, the state machine and its stages, the `Order` of the old chat, step events), `src/core/conversation-log/`, `read-reply.ts`, `eval-set/eval-run/eval-score/eval-answers` of `order-matching/`, and of `planning/` the eval set, `route-message.ts` (the Topic), `plan-searches.ts`, `plan-budget.ts` and the `plan` task types. `Llm` is now only `fitProducts`.
- Adapters: the `routeMessage`, `parseOrder`, `readReply`, `plan` tasks and the Idea judge of `claude-code-llm.ts` (with their schemas and tests); `data-files.ts` lost the order and planning eval loaders and savers, the Conversation Log writer, `headCommit` and the latest-run reader.
- App: the old root chat (`chat.tsx`, `sessions.ts`, `turn-events.ts`, `step-text.ts`, `api/turn/route.ts`) and the CSS of the old cards. The agent chat moved from `/agent` to `/` (`page.tsx`, `agent-chat.tsx`); `POST /api/agent` keeps its path.
- Commands and data: `order:eval`, `order:eval-set`, `order:label`, `plan:eval`, `plan:eval-set` and their CLI files; `evals/order-matching.json`, `evals/planning.json`; prompts `parse-order.md`, `read-reply.md` and `prompts/planning/`. `pnpm check` now ends with `pnpm agent:eval-set` only.
- Docs: `ARCHITECTURE.md` (the order and Plan end-to-end sections are gone, replaced by "From Fits to a cart"), `docs/LLM.md` (only `fit-products`, the agent, Plans in the agent chat and the agent eval set), `docs/TESTING.md`, the Commands and the push list of `CLAUDE.md`, and the glossary (**Topic** and **Conversation Log** removed).

**Kept, moved or renamed**
- `steps.ts` moved to `src/core/order-matching/` and is trimmed to the one step `matchItems` reports; `checkPlan` of `src/core/planning/plan.ts` now takes `(plan, seen, budget)` since only `proposePlan` calls it; `PLAN_MATCHES_LIMIT` and `SEARCH_ROUNDS_LIMIT` moved into `plan.ts`.
- `pnpm order:label` is now `pnpm agent:label` (same output): labelling a case needs it and the agent eval set is the only one left. `product-line.ts` stays for it.
- Cases moved into the agent eval set: `size-words-pick-the-biggest` (from `dos-cocas-grandes`) and `preferences-are-ignored` (from `nada-de-marolio` and `pago-con-visa`). The other old order cases (single phrases such as "medio sachet de leche") tested `parse-order`, which no longer exists, and the 15 routing and 14 plan cases tested the router and the `plan` task; the recipe, gift, advice and off-topic behaviour they stood for is covered by the existing agent cases.

**Decisions to review**
- I deleted the Conversation Log completely, code and glossary term: only the old route wrote it and the agent chat never did, so keeping `loggedStore`, `loggedSearch` and `openConversationLog` would have left code of the old flow. The spec said the term is "redefined" for the agent; if a log per agent turn is wanted, it is new work. `.data/conversations/` and `.data/order-resolution`, `.data/planning` on this machine are left untouched (not committed).
- `POST /api/agent` was not renamed.

**Commands run**
- `pnpm agent:eval size-words preferences-are --runs 3` (real Claude Code sessions, Catalog Snapshot of 2026-10-15): `size-words-pick-the-biggest` 3 of 3 runs passed; `preferences-are-ignored` 1 of 3 failed (an earlier `--runs 2` run: 1 of 2 failed): the agent answered the first message in text, "¿Confirmás el pedido así?", instead of calling `proposeOrder`. It is marked `expectedToFail` with that reason. 0 errors in 11 runs.
- Checked by hand with `pnpm dev` (stopped the server that was already on :3000, started mine, stopped it at the end), real Claude Code session and Carrefour, `.data/chat/` moved away and restored afterwards: `curl /` 200 with "Hola, escribime lo que necesitás."; `curl /agent` 404; `GET`/`POST /api/turn` 404; `POST /api/agent` "Hola, mi código postal es 1425 y necesito 2 leches descremadas La Serenísima" returned a proposal card (2 × Leche La serenisima liviana 1% 1L, $4318.00); "Confirmar" returned the cart card with the Carrefour link; `curl /` after that holds both cards (the Chat is loaded from disk on a fresh request), `profile.json` has `{"postalCode":"1425"}` and `orders.json` has `order-1` closed.
- `pnpm check`: exit 0 (typecheck, lint, format, no-comments, docs:check, 419 tests in 34 files, `agent:eval-set` valid).

**Open**
- I did not click in a browser; the page was checked through the server-rendered HTML and the API.
- I did not re-run the whole agent eval set after the deletions (only the two new cases); nothing in the agent's tools or prompt changed, but `fit-products` and the agent adapter now sit behind the trimmed `Llm`.
