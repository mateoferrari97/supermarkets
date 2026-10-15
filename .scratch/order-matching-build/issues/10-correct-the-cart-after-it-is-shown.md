# 10: Correct the cart after it is shown

**What to build:** The conversation stays open after the cart. The Owner's next reply is read by `read-reply`, which now also sees the Items in the cart; a Correction reruns only the corrected Items and the turn replies with a new cart that replaces the previous one, its added and changed lines marked. See the spec, "Turn" and "Cart message and Notes".

**Blocked by:** 09

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- `read-reply` gets every Item numbered: asked ones with question and Alternatives, ones in the cart with `original` and the product bought. It returns entries only for the Items the reply touches; an Item in the cart can get `lines` (a replacement: "la coca de 1,5" is `lines` with the new `size`) or `drop`. An ambiguous reference ("cambiá la coca" with two cocas) is `unanswered` with a question, spending one of that Item's questions.
- A corrected Item starts with 2 new questions. Items not touched keep the product bought; corrected and new Items run the flow; then the whole cart is simulated once.
- The new cart shows every line; lines added since the last cart are marked "Nuevo", corrected ones "Cambiado", without the previous product. A Note shows in the first cart that holds its Item; a later cart shows only the Notes of its marked lines and of its own block; "Saqué: …" for an Item removed by a Correction.
- No end state: the `done` stage goes; the chat keeps its input enabled after a cart; the session is deleted after one hour without a turn or when a turn fails, not when a cart is delivered.
- One Correction case joins the answer cases of the eval set ("cambiá el carbón por uno de 5 kg").

## Acceptance

- [ ] `takeTurn` tests with fakes: a Correction of brand, size and quantity; a drop; an ambiguous reference asked; untouched Items keeping their product; "Nuevo" and "Cambiado" marks; Notes shown once; a Correction together with an answer.
- [ ] One real conversation in the chat with two Corrections after the first cart: Conversation Log path and both carts noted under Comments.
- [ ] `ARCHITECTURE.md` describes the open conversation and the session lifetime.
- [ ] `pnpm check` exits 0.

## Comments
