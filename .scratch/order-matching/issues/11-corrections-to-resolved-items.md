# 11: Corrections to resolved Items

Type: grilling
Status: resolved
Blocked by: 05

## Question

How does the Owner change an Item already resolved, after the cart ("cambiá el carbón por Patagonia", "la quiero de 1,5") or in a reply to a question, where [Questions and answers in the new flow](05-questions-and-answers.md) ignores it with a note for now? Does the conversation stay open after the cart, does a correction rerun call 1 for one Item the way an answer does, how is the corrected Item told apart from the rest, and is the cart simulated again?

## Answer

Agreed with the Owner on 2026-10-15. New glossary term: Correction.

- **The conversation stays open after the cart.** A Correction after the cart produces a new cart that replaces the previous one. There is no limit on Corrections and no explicit end: the conversation ends when the Owner closes the chat or starts another. One Conversation Log per conversation records every cart (glossary updated).
- **One call reads answers and Corrections.** It is call 1 in follow-up mode, which replaces the answer call of [Questions and answers in the new flow](05-questions-and-answers.md). It gets every Item, numbered: asked Items with their question and Alternatives, resolved Items with their `original` and the product bought. It returns one entry only per Item the reply touches: `choice`, `lines` (a replacement, which goes through search, call 2 and the size rule again), `drop`, or `unanswered` (asked Items only), plus `newLines`. A resolved Item the reply does not mention stays as it is. "la quiero de 1,5" is `lines` with the new `size` for that Item. The note "change to a resolved Item ignored" of ticket 05 goes away.
- **The LLM finds the corrected Item by its number** in that list. When the reference is ambiguous ("cambiá la coca" with two cocas) it returns `unanswered` with a question ("¿cuál coca, la zero o la normal?"), which spends one of that Item's 2 questions.
- **A corrected Item starts with 2 new questions**, like a new line.
- **What is recomputed:** Items not touched keep the product bought. Corrected Items go through the whole flow. Then the whole cart is simulated once for the total and the link. As in ticket 05, there is no cart while a question is open.
- **The new cart shows every line again**, marks the changed ones, and shows only this turn's notes.
- **Cart link:** it is not known whether `/checkout/cart/add` (`src/adapters/carrefour/carrefour-store.ts:292`) adds to a cart the Owner already opened or replaces it. [Does the cart link add to an open cart](13-does-the-cart-link-add-to-an-open-cart.md) verifies it. Until then the spec assumes it adds: every cart after the first says "Si ya abriste el carrito anterior, vacialo antes de abrir este".

Facts behind it: today `takeTurn` throws in `stage: "done"` (`src/core/order-conversation/take-turn.ts:81`) and the chat finishes on the `cart` event (`src/app/chat.tsx:99`).
