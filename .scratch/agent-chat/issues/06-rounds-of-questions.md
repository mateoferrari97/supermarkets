# 06: Rounds of questions when nothing fits

**What to build:** When `resolveItem` finds no Fit it returns 3 Alternatives, and the agent asks with `askQuestions`: one round with every open question, numbered, each with its options and a recommended one, ending the turn. The page shows the round as a card with "Más opciones" (the next 3 not yet shown) and "Aceptar recomendadas". The Owner's reply, by tap or in words, resumes the Order.

**Blocked by:** 04

**Status:** ready-for-agent

- [x] `resolveItem` returns 3 Alternatives at a time and never repeats an excluded product (tests)
- [x] A round is stored as a message of the Chat and survives a reload
- [x] Every question of the turn is in one round
- [x] `pnpm check` is green

## Comments

2026-10-16 (worker): built.

- Core `src/core/agent-chat/`: `resolveItem` now answers `choose` when call 2 keeps no Fit: `{ ref, alternatives }` with 3 Alternatives (the `closest` of call 2 first, then the best remaining Matches, deduplicated), or `none` when nothing is left. `excludeProductIds` leaves products out of the search (`withoutExcluded`) and the products the waiting Item already showed are excluded too, so "más opciones" never repeats; it replaces the waiting Item under the same ref, and a Fit among the remaining products is `picked`. `ask-questions.ts` (`askQuestions`: every open question of the turn in one round, numbered by code; options are `productId`s among that ref's Alternatives, with name and price taken from the Order, or free labels; a recommended position; it ends the turn and refuses a second round in the same turn, unknown refs, foreign products, bad options and bad recommended positions). `round.ts` (schema, `renderRound`). `chat.ts` gains the `round` part, so a round is a stored message of the Chat. `order.ts` gains the `choose` Item (Alternatives as full catalog products and every product shown). `propose-order` refuses a `choose` ref (`needs-choice`) and shows a waiting Item it leaves out as a Note.
- Decision not in the spec text: the Owner's pick needs a tool, so I added `chooseAlternative({ ref, productId })` (`choose-alternative.ts`), which simulates the chosen product in the Branch at the Item's quantity and replaces the waiting Item with a picked one (`unavailable` when the Branch cannot sell it). With `recommended: true` instead of `productId`, code reads the recommended option of the latest round for that ref from the Chat. I added it after a live run in which the agent, asked to "Aceptar las recomendadas", picked options that were not the recommended ones. Re-resolving by product name would have gone through call 2 again and could pick another product.
- Page `/agent`: `RoundCard` (a radio per option, the recommended one marked, "Más opciones" per question that has products, "Enviar elegidas" and "Aceptar recomendadas"); interactive only while it is the last message. Each button sends text as the Owner's next message ("Más opciones para la pregunta N", "N: <option>" lines, "Aceptar las recomendadas"). The root page and `/api/turn` are untouched.
- Prompt `prompts/agent/system.md`: ask only after `choose` or an ambiguous request, once, all questions in one `askQuestions` call, recommend one option, read the reply into `chooseAlternative` calls, `excludeProductIds` for more options, leave out dropped Items.
- Docs: `ARCHITECTURE.md`, `docs/LLM.md`, `docs/TESTING.md`.
- Tests: `resolve-item.test.ts` (3 Alternatives, closest first, excluded products never repeated, same ref on more options, products shown before excluded even if the agent forgets, `none` when everything was shown, a Fit among the rest is picked, draft after a proposal), `ask-questions.test.ts`, `choose-alternative.test.ts`, `round.test.ts`, `propose-order.test.ts` (`needs-choice`, the Note for a waiting Item left out), `order.test.ts`, `tools.test.ts` (registry, from a round to a proposal), `data-files.test.ts` (a round part and a `choose` Item round trip, an invalid round rejected: a round "survives a reload" because it is a line of `messages.jsonl` read back through `loadChatMessages`).

Checked by hand against the dev server already running on localhost:3000 (not mine, not restarted; Next hot-reloaded), real Claude Code session, real Carrefour, empty `.data/chat/`, postal code 1425:

- "necesito un queso azul de cabra sin lactosa" (16.4 s): one round with 1 question and 3 options (Santa Rosa x kg, Wapi natural 120 g marked recommended, Lucrecia x kg) with snapshot prices; `orders.json` held the `choose` Item with its Alternatives and `shown`.
- "Más opciones para la pregunta 1" (17.0 s): a new round with 3 other products (255560, 608877, 770600); `shown` held 6 distinct ids and the Order still had one Item (same ref).
- "1: Queso azul Santa rosa 140 g." (8.1 s): the proposal with that product; "Confirmar" (3.4 s): the cart; `order-1` closed.
- "necesito leche, un queso azul de cabra sin lactosa y una galletita de trigo sarraceno con chía" (23 to 32 s): leche picked with no question and a single round with both open questions (3 options each, one recommended each). "Aceptar las recomendadas": the cheese was the recommended option (Emperador x kg in the last run). The Frutigran 170 g that was recommended for the biscuits was not available in the Branch, so the agent opened a second round with other options; "1: Galleta grisin Grun..." led to the proposal with 3 lines and "Confirmar" built the cart (`order-1` closed with the 3 items).
- Before `recommended`, the same "Aceptar las recomendadas" gave a proposal with other products than the recommended ones, and before the Note for a waiting Item left out, a proposal silently omitted the biscuits; both were fixed and the runs above are after the fixes.
- `grep -c '"type":"round"' .data/chat/messages.jsonl` found the rounds on disk, and `curl localhost:3000/agent` rendered the rounds from the file (4 occurrences of the round heading, which includes the data Next embeds); `curl localhost:3000/` still 200. I did not stop and start `pnpm dev`, and I did not click in a browser, so the card's buttons (radios, "Más opciones", "Enviar elegidas", "Aceptar recomendadas") were not exercised; I typed the texts they send through the API. `.data/chat/` was deleted afterwards.

Open:
- Whether the agent asks only when it should (not after a `picked` Item, not twice) is held by the prompt and observed in the runs above, but nothing scores it until the eval set (ticket 10).
- By-weight Alternatives show the snapshot price per kg (the product name says "x kg."); the round does not say "por kg".
- A turn with `choose` takes 16 to 32 s with real Claude Code and Carrefour (call 2 per Item dominates), over the 15 s target of the spec.

`pnpm check` exited 0 (606 tests in 43 files; eval set validators valid).
