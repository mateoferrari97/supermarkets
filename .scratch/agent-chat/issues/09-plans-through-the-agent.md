# 09: Plans in the agent chat

**What to build:** Recipes, events, weekly menus, gifts and advice work in the agent chat: `searchCatalog` searches every in-stock department, and the proposal carries Plan Lines and the Idea under the checks of ADR 0013 (products seen, valid quantities, totals, budget). A confirmed Plan gets its cart as an order does.

**Blocked by:** 05

**Status:** ready-for-agent

- [x] Every check of ADR 0013 runs in core and is tested
- [x] The eight cases of the meal planner work in the new page, checked by hand
- [x] `docs/LLM.md` updated
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `search-catalog.ts` (`searchCatalog({ queries })`: needs the postal code, scope `plan`, 20 Matches per query, at most 8 queries per call and 3 calls per turn, saves the products found, once each, in the Order's new `seen` and answers one row per product), `plan-turn.ts` (the per-turn counters, created by `agentTools` for each turn), `propose-plan.ts` (`proposePlan({ title, idea, lines, budget?, notes? })`: runs `checkPlan` of `src/core/planning/plan.ts` over the products seen, so the checks of ADR 0013 are not written twice: product seen, positive quantity, whole units or whole grams, at most 60 lines, positive budget; plus `no-price`; merges lines, rounds by-weight quantities to the Sale Step with the Candidate's Note, prices from the Catalog Snapshot; a Plan over the budget is refused once per turn with the amount to cut and, the second time, shown with `overBudget`; it records the Plan as the Order's proposal with its `idea` and ends the turn with the card, except on a reopened Order). `order.ts`: `seen`, `idea` and `overBudget` in the schemas, `renderProposal` and `renderCart` show the Idea, `renderOrder` lists the Plan's lines and every product seen (so a revision in a later turn can use them). `build-cart.ts` copies the Idea into the `Cart`; nothing else changed in `buildCart`, a Plan goes through it like an order. `tools.ts` registers `searchCatalog` and `proposePlan`.
- Decision not in the spec text: "products seen" lives in the Order (`seen`), not in the Chat, because the Order is what the tools already read and save; a new Order starts with none. A Correction of a Plan's cart works through `reopenLastOrder`, `searchCatalog`, `proposePlan`, `buildCart` (prompt only; not run live).
- Prompt `prompts/agent/system.md`: new section "Plans" with what `prompts/planning/plan.md` taught the planner; the sentence "You cannot plan menus or recipes yet" is gone. Page `/agent`: the proposal and cart cards show the title and sections of the Idea, the purpose of each line and, when still over the budget, by how much. Docs: `ARCHITECTURE.md` (layers, turn step 6, data), `docs/LLM.md` ("Plans in the agent chat"), `docs/TESTING.md`. No new command, so the Commands of `CLAUDE.md` are unchanged.
- Tests: `search-catalog.test.ts`, `propose-plan.test.ts` (each check of ADR 0013, merging, Sale Step rounding and Note, totals, budget sent back once then shown, reopened Order), `tools.test.ts` (a Plan from search to a cart with the Idea, refused as `unanswered` before the Owner answers; tool list), `order.test.ts` (schema, `<order>` block), `data-files.test.ts` (a Plan proposal and `seen` round trip).

Checked by hand against the dev server already on localhost:3000 (this repo's, hot reload, not restarted), real Claude Code session, real Carrefour, postal code 1425, `.data/chat/` emptied between cases and deleted at the end. Each case through `POST /api/agent`:

- recipe, revision, constraint, Idea in the cart: "quiero hacer lasaña para 4" (37 s): proposal card with the Idea (ingredients, steps) and 12 lines, total $44020.50; "que sea para 6, y sin ajo" (43 s): revised Plan for 6 with no ajo; "Confirmo" (6 s): cart card with the Idea above, 10 lines, total $66754.10 and the link; the nuez moscada ran out and was dropped with its Note. `orders.json`: `order-1` closed, 2 proposals, 259 products seen, `cart.idea` present.
- event with a budget: "un asado para 10 con unos $50.000" (66 s): Plan with total $47280.00, no `overBudget`. The agent cut the meat to about 120 g per person to fit and said so in the card's notes.
- weekly menu with a diet: "armame las cenas de lunes a viernes para 2, soy celíaca; aceite y sal tengo" (53 s): one section per day, 13 lines, milanesas "libre de gluten", no oil or salt, noted.
- gift: "un regalo para mi vieja, le gusta cocinar, hasta $30.000" (39 s): kitchen board, knives, utensils and spices, total $22524.00.
- advice and then buy: "¿qué vino va con pescado?" (4 s): text only, no Order created (`orders.json` absent); "dale, comprame uno" (10 s): Plan with a Sauvignon Blanc $6849.00 and the advice as a section.
- allergy (constraint): "quiero hacer panqueques para 4, mi hijo es alérgico a la leche" (24 s): almond drink instead of milk, noted.
- off-topic: "¿cuál es la capital de Francia?" (2 s): a brief answer and what the chat is for.
- tight budget: "un asado para 12 con $15.000 como máximo" (97 s): the Plan ended at $14726.75 with chicken, bread and tomato, within the budget and with a note that it is below the usual amounts. I could not see from the outside whether `proposePlan` refused an earlier attempt as `over-budget`: tool calls are not logged, so the refusal is covered by `propose-plan.test.ts` only.
- `curl localhost:3000/agent` rendered "Armé este plan:" and the Idea of the last proposal; `curl localhost:3000/` still 200.

Open:
- I did not click in a browser: the Plan cards were checked only in the server-rendered HTML, and the "Confirmar" chip was exercised by typing "Confirmo".
- A Correction of a Plan's cart and a Plan revision that adds a product with a new search were not run live.
- Whether the model keeps the Plan rules (diets, amounts per person, not repeating a search, writing nothing after `proposePlan`) is its own judgement until the agent eval set (ticket 10). In the asado cases it traded the amount of meat per person for the budget, which the rules allow.
- A by-weight line shows its quantity in Sale Steps in the card and the cart (`× 2` for 1 kg at a Sale Step of 500 g), as the order flow's lines already do.
- Plan turns take 24 to 97 s with real Claude Code and Carrefour, over the 15 s target.
- `orders.json` keeps every product a Plan searched (259 in the lasaña Order) in `seen`.

`pnpm check` exited 0 (646 tests in 47 files; eval set validators valid).
