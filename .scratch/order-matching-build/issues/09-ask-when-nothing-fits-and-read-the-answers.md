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

- [ ] `takeTurn` tests with fakes: questions with Alternatives and no simulation; each entry kind; a missing entry; re-ask in code with the same Alternatives; the 2-question limit dropping an Item; `newLines`; a cart once the last question is answered.
- [ ] Adapter tests for `read-reply`: input, schema, the checks.
- [ ] Answer cases validated by `pnpm order:eval-set` and run once by `pnpm order:eval`; results noted under Comments.
- [ ] One real conversation in the chat with a question answered by number and one by a new brand: Conversation Log path noted under Comments.
- [ ] `docs/LLM.md` describes `read-reply`.
- [ ] `pnpm check` exits 0.

## Comments
