# 02: Order module: questions, read-reply and matching hand-off

**What to build:** A pure **Order** module in core (order-conversation feature) owns the Items of one conversation and every rule about how they move from read to asked to ready to buy. `takeTurn` keeps its interface and its postal-code stage, but for the rest it only sequences the ports and hands their answers to the Order. The Owner gets the same questions as today: an Item left unanswered is asked again once and then dropped with a Note, and Items rewritten, corrected or added are matched again.

The Order interface, in words:

- start from the postal code, the matched Items and whether a preference was ignored;
- list the Items for `read-reply` (asked and in the cart, numbered as the LLM sees them), so the numbering the LLM sees and the numbering the Order reads back come from one place;
- apply a checked `read-reply` output (ticket 01), returning the next Order and the Items that need matching (corrected, rewritten or new);
- take the match results for those Items back in, in the same order it gave them out;
- say what comes next: either the questions message (text plus each question's options) or the Items to buy.

The question limit (two per Item) is checked in one place. The dropped and removed Note texts, the questions hint and the questions message text move into the Order. `ConversationState` stays the serializable state the app stores between turns.

**Blocked by:** 01 (Check LLM answers in core)

**Status:** resolved

- [x] The Order module is pure (no ports) and owns Item kinds, questions spent, dropped and removed Notes and the ignored preference flag
- [x] The question limit is checked in exactly one place
- [x] `takeTurn` never inspects Item kinds and holds no bookkeeping of positions
- [x] Plain data tests of the Order cover re-asking, dropping after two questions, Corrections, drops, choices and new Items; the matching rule tests in `take-turn.test.ts` move here
- [x] Messages and questions shown to the Owner are unchanged for the same LLM answers
- [x] **Order** is added to `GLOSSARY.md`: the Items of one conversation and where each stands (read, asked, in the cart), from the first message to the last cart
- [x] `docs/TESTING.md` names the Order tests as the home of conversation rules and `takeTurn` tests as wiring
- [x] `pnpm check` is green

## Comments

- The Order lives in `src/core/order-conversation/order.ts`: `startOrder`, `replyItems`, `applyReply` (returns a `MatchingOrder` with `to-match` placeholders and the `toMatch` Items in order), `withMatches` (fills the placeholders in that order and throws on a count mismatch) and `nextStep` (questions message or Items to buy). `MAX_QUESTIONS` is checked only in its `asking` helper.
- `applyReply` throws when an asked Item has no entry instead of falling back; `checkedReadReply` (ticket 01) always gives one.
- Taking the cart result is ticket 03: `takeTurn` still pairs the simulated lines with the Items to buy and builds the cart state, but through `ItemToBuyInOrder.keptReason`, `mark` and `boughtItem`, never through Item kinds. `IGNORED_PREFERENCE_NOTE` and the cart Notes order stay in `take-turn.ts` for that ticket.
- Rule tests that end in questions or dropped Items moved to `order.test.ts`; tests whose outcome is a cart (marks, Notes under the table) stay in `take-turn.test.ts` for ticket 03.
