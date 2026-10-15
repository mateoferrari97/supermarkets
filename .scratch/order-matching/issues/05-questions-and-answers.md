# 05: Questions and answers in the new flow

Type: grilling
Status: resolved
Blocked by: 02

## Question

When call 2 finds no Fit for an Item it asks the Owner. How is the Owner's answer handled once `map-answer` is gone: does it rerun call 1 for that Item with the question and the answer, or something else? What happens to the Items that already have Fits while one is asked, and how many rounds are allowed before the Item is dropped?

## Answer

Agreed with the Owner on 2026-10-15.

- **An answer reruns call 1 for the asked Items only.** It gets every open question, numbered, with its Item's `original`, its text and its Alternatives, plus the Owner's reply. It returns exactly one entry per question, of one of four kinds: `choice` (an Alternative by number), `lines` (new Items for that question, which go through a new search, call 2 and the size rule), `drop` or `unanswered`; and `newLines` for things the reply adds. Code checks one entry per question and valid numbers; a missing entry counts as `unanswered`. Example: "dale, una Patagonia" becomes `lines: [{ product: "Cerveza", brand: "Patagonia", ... }]`.
- **No cart while a question is open.** The Fits of the other Items are kept, not recomputed; nothing is simulated before asking, so checkout simulation runs once.
- **Every question shows up to 5 Alternatives** (new glossary term). Call 2 returns them as `closest` (Match numbers, most alike first) only when `fits` is empty; code checks they are among that line's Matches. Each is shown with its name and its Catalog Snapshot price, unmarked.
- **A picked Alternative is bought as is:** no search, no call 2, no size rule; the quantity comes from the original Item.
- **At most 2 questions per Item.** Both an answer that leads to no Fit and an ignored question (`unanswered`) spend one. After the second, the Item is dropped and the cart says so in a note.
- **Re-asking an `unanswered` question is code:** the stored text and Alternatives are sent again as they were, prefixed "Me falta saber de X:", with no LLM call and no search, so "la 2" keeps pointing at the same product.
- **A reply that goes beyond the questions:** a new thing ("agregá un vino tinto") becomes a new Item through the whole flow, with its own 2 questions; a change to an Item already resolved ("la coca mejor de 1,5") is ignored with a note until corrections are decided.

Facts behind it: today `answerQuestions` (`src/core/order-resolution/resolve-order.ts:197`) sends every open question and the reply to `mapAnswer`, and `take-turn.ts` stays in `stage: "questions"` with no round limit, which is how the carbón question looped.

## Comments

- From [Corrections to resolved Items](11-corrections-to-resolved-items.md): a change to a resolved Item is no longer ignored; the answer call becomes call 1 in follow-up mode, which also reads Corrections.
