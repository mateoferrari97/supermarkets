# 09: Ask when nothing fits and read the answers

**What to build:** When any Item has no Fit, the turn replies with the questions instead of a cart, each with up to 5 Alternatives; the Owner's reply is read by the `read-reply` task (call 1 in follow-up mode) for the asked Items, and the flow continues until no question is open. See the spec, "LLM tasks" (`read-reply`) and "Turn".

**Blocked by:** 08

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- No cart while a question is open; Items with Fits are kept, not recomputed; nothing is simulated before asking.
- The message: one numbered question per asked Item, each Alternative by name and Catalog Snapshot price, unmarked. Chips per Alternative; the "cualquiera" chip goes.
- `read-reply` (prompt `prompts/order-matching/read-reply.md`, `claude-sonnet-5-5`, `--effort low`) gets the asked Items numbered with `original`, question and Alternatives, and the reply; it returns entries (`choice`, `lines`, `drop`, `unanswered`), `newLines` and `ignoredPreference`. Code checks one entry at most per Item and valid numbers; a missing entry is `unanswered`.
- `choice`: bought as is, with the Item's quantity. `lines`: new Items through search, call 2 and the size rule. `drop`: block Note "Saqué: <original>". `unanswered`: re-asked by code, "Me falta saber de <original>:" plus the stored text and Alternatives, no LLM call.
- At most 2 questions per Item; an answer that leads to no Fit or an `unanswered` spends one; after the second the Item is dropped with a block Note. `newLines` are new Items with their own 2 questions.
- The temporary "not got" handling of ticket 08 for an Item with no Fit is removed.
- Answer cases join `evals/order-matching.json` and `pnpm order:eval`: "la 2", "dale, una Patagonia", "sacala", an ignored question, "agregá un vino tinto".

## Acceptance

- [x] `takeTurn` tests with fakes: questions with Alternatives and no simulation; each entry kind; a missing entry; re-ask in code with the same Alternatives; the 2-question limit dropping an Item; `newLines`; a cart once the last question is answered.
- [x] Adapter tests for `read-reply`: input, schema, the checks.
- [ ] Answer cases validated by `pnpm order:eval-set` and run once by `pnpm order:eval`; results noted under Comments.
- [x] One real conversation in the chat with a question answered by number and one by a new brand: Conversation Log path noted under Comments.
- [x] `docs/LLM.md` describes `read-reply`.
- [x] `pnpm check` exits 0.

## Comments

### read-reply task part (2026-10-15)

Built only the `read-reply` LLM task; `takeTurn`, the chat and the eval answer cases are left to the turn part, so their boxes stay open.

- Prompt `prompts/order-matching/read-reply.md`; port `Llm.readReply` in `src/core/order-resolution/llm.ts`; input and output types in `src/core/order-matching/read-reply.ts` (`ReplyItem` is an asked Item with its `Question`, or an Item in the cart with the product bought, so ticket 10 needs no prompt change); schema `readReplyOutputSchema` and checks in `src/adapters/claude-code/`; `claude-sonnet-5-5 --effort low`.
- The adapter fails the call on: an Item number outside the list, two entries for one Item, an `alternative` outside that Item's Alternatives, `choice` for an Item in the cart, `unanswered` without a question for an Item in the cart, empty `lines`, a line `size` or `quantity` the parser rejects. It adds `unanswered` with a null question for every asked Item with no entry and returns entries in Item order.
- Adapter tests with a fake `ProcessRunner` in `src/adapters/claude-code/claude-code-llm.test.ts` (`describe("readReply")`). `docs/LLM.md` has a `read-reply` section; `ARCHITECTURE.md` lists `readReply`. `pnpm check` exits 0.
- Real calls, one session each, made-up Items (not from the Catalog Snapshot) through a throwaway script calling `createClaudeCodeLlm(...).readReply`. Session time is `duration_ms` of the Claude Code result; wall time includes CLI start.

| Reply | Items | Output | Session | Wall | Cost |
|---|---|---|---|---|---|
| "la 2 y el queso el primero" | 2 asked, 1 in cart | choice 2 for 1, choice 1 for 2 | 2.3 s | 3.8 s | $0.0196 (cold cache) |
| "dale, una Patagonia" (Patagonia is Alternative 3) | 1 asked, 1 in cart | choice 3 | 3.0 s | 4.5 s | $0.0051 |
| "dale, una Patagonia" (no Patagonia among Alternatives) | 1 asked, 1 in cart | lines: Cerveza, brand Patagonia, common, 1 unit | 2.2 s | 3.5 s | $0.0055 |
| "sacala" | 1 asked, 1 in cart | drop | 2.1 s | 3.5 s | $0.0056 |
| "¿a qué hora llega el pedido?" | 2 asked | unanswered for both | 1.9 s | 3.5 s | $0.0057 |
| "la quilmes. agregá un vino tinto" | 1 asked, 1 in cart | choice 2; newLines: Vino tinto, common, 1 unit | 2.2 s | 4.0 s | $0.0056 |
| "cambiá la coca" | 3 in cart (zero, normal, pan) | unanswered for 1 with "¿Cuál coca querés cambiar, la zero grande o la normal chica? ¿Y por cuál la cambio?" | 3.4 s | 4.8 s | $0.0054 |
| "la coca zero mejor de 1,5 y sacá el pan" | 3 in cart | lines for 1: Gaseosa cola zero, Coca Cola, 1.5 l; drop 3 | 2.1 s | 3.5 s | $0.0058 |

All 8 outputs are what the spec expects. "un vino tinto" and "una Patagonia" come back as `1 unit` rather than `minimum`; both buy one unit of a packaged product, so the cart is the same.


### Turn and chat part (2026-10-15)

- `takeTurn` (`src/core/order-conversation/take-turn.ts`) has a `questions` stage. Its state keeps per Item either the Item to buy (Candidates of its Fits, not recomputed) or the asked Item with its `Question`, the questions spent and whether it is a re-ask; plus the block Notes (dropped after two questions, removed) and `ignoredPreference`. The reply kind `questions` carries the text and, per question, the Alternative names for the chips. The temporary "not got" of ticket 08 is gone.
- Message: "Tengo una pregunta:" or "Tengo unas preguntas:", one numbered question per asked Item with its Alternatives as `   n) name ($price)` (price left out when the snapshot has none), then the hint 'Respondé con el número ("la 2"), con otro producto o marca ("dale, una Patagonia") o "sacala".' A re-ask is "Me falta saber de <original>: <stored text>" with the same Alternatives. An empty reply re-sends the same questions with no call.
- `choice` uses `candidateOf` (`src/core/product-selection/candidates.ts`): the Item's quantity applied to that product, no size rule; when the quantity cannot apply (a weight for a product not sized by weight) it falls back to one unit.
- Question count, as read from the Decisions: the first question spends 1; `unanswered` and lines with no Fit spend one more; an Item that would need a third is dropped with the block Note 'No conseguí "<original>": te pregunté 2 veces y no encontré qué llevar'. Lines that replace an asked Item inherit its count (the spec says "each with 2 new questions", which would let an Item be asked three times; the ticket's "at most 2 questions per Item" wins). `newLines` start at 0.
- Block order after the table: Items not got (dropped after two questions, then every Candidate unavailable), Items removed ("Saqué: <original>"), the ignored card or preference.
- Chat: one chip per Alternative, which adds its name to the reply; the "cualquiera" chip is removed. The chat still ends on the cart (ticket 10).
- Tests: `describe("questions")` in `take-turn.test.ts`, 14 cases, plus the Notes test now drops its asked Item through a reply.

Real conversations through `pnpm dev` (`POST /api/turn`, the chat's endpoint), CP 1425, commit 09002b3. Conversation Logs in this worktree's `.data/conversations/` (not committed):

| Log | Order | Reply | Result | Turn times |
|---|---|---|---|---|
| `2026-10-15-182215-afcce55e-fe3b-4420-9fef-9cc805387c0b.jsonl` | "cerveza artesanal de tamarindo y un vino de frutilla": 2 questions, 5 and 3 Alternatives | "la cerveza la 5. el vino dale, uno de Toro" | `choice` 5: Cerveza Amber República Artesanal 473 ml; `lines` "uno de Toro": call 2 picked Vino tinto Merlot Alaris 750 ml with Note "No hay vino Toro; elegí otra marca." Cart $5200.85, empty block | 7.4 s, 9.8 s (read-reply 3.4 s, call 2 5.3 s, simulation 1.1 s) |
| `2026-10-15-182019-450d51f4-42cc-461d-b10e-326e8119bba1.jsonl` | yerba Playadito 1 kg, cerveza de tamarindo, vino de frutilla: 3 questions | "la yerba la 1, la cerveza dale una Patagonia, y el vino sacalo" | choice, lines (Patagonia Amber Lager 730 ml), drop ("Saqué: un vino de frutilla"); the chosen yerba was unavailable in the Branch, so it went to the block | 14.6 s, 11.1 s |
| `2026-10-15-182102-04fc91c9-20b4-4fa2-ac89-e9dd7a2d8db1.jsonl` | cerveza de tamarindo, jugo de mburucuyá, yerba | "la cerveza dale, una Patagonia. el jugo la 2" | lines and choice; the chosen Clight (itemId 157405) was unavailable alone in the Branch | 9.8 s, 11.0 s |
| `2026-10-15-182140-0a919325-f406-42cc-8c1f-9616e4455226.jsonl` | cerveza de tamarindo, vino de frutilla, una docena de huevos | "la cerveza la 4. el vino no, dale un vino tinto Toro" | choice of an Antares unavailable in the Branch; lines to Alaris | 11.6 s, 9.6 s |

Every `read-reply` output was right. Seen, outside this ticket:

- Three of four chosen Alternatives were unavailable in the Branch: Alternatives come from Matches, filtered only by snapshot stock, and a chosen one is a single Candidate, so it goes to the block with no question, as the spec says.
- "yerba playadito 1 kg" got no Fit (call 2 asked for "Playadito tradicional"), and "una docena de huevos" bought 12 packs of 6 eggs (call 1 or the quantity rule; tickets 04 and 06).
