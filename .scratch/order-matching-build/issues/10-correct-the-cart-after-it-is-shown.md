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

- [x] `takeTurn` tests with fakes: a Correction of brand, size and quantity; a drop; an ambiguous reference asked; untouched Items keeping their product; "Nuevo" and "Cambiado" marks; Notes shown once; a Correction together with an answer.
- [x] One real conversation in the chat with two Corrections after the first cart: Conversation Log path and both carts noted under Comments.
- [x] `ARCHITECTURE.md` describes the open conversation and the session lifetime.
- [ ] `pnpm check` exits 0.

## Comments

### Build (2026-10-15)

- `takeTurn` has no `done` stage: after a cart the state is stage `cart` with each Item in the cart (its Item, the Candidate bought, the reason shown and its questions spent). Every reply after the postal code and the order goes to `read-reply` with the asked Items and the Items in the cart, numbered.
- Items not touched are passed to `simulateCart` with `kept: true`: they are not simulated alone and get no promotion hint, only the whole-cart simulation; their reason is the one of the previous cart. When the whole cart has a kept product unavailable, the Item goes to the block with the substitution Note.
- Cart lines carry `mark`: `new` for `newLines` once a cart was shown, `changed` for the lines of a Correction; the chat shows "Nuevo" and "Cambiado" before the product name. Kept lines show no Notes; the block holds only the Notes since the last cart, and the ignored card or preference shows once.
- Ambiguous reference: the Item in the cart becomes asked with the LLM's question and no Alternatives, spending one of its questions; an Item with no question left keeps its product and the reference is ignored. Decision taken in the build: when the next reply gives that asked Item no entry (for example it answers by correcting the other Item), the Item goes back to the cart as it was, with its question spent, instead of being re-asked or dropped: a Correction the Owner leaves aside never removes a product already in the cart.
- `read-reply.md`: the question of an ambiguous Correction names the change, so that its answer can be read alone, and an answer that picks another Item gets the entry on that Item.
- The chat keeps its input after a cart; "Nuevo pedido" shows only after an error. `route.ts` releases the session after every completed turn; it is deleted only when a turn fails or after one hour without a turn.

### Real conversation (2026-10-15)

Conversation Log: `.data/conversations/2026-10-15-182935-b88ba26b-b8a3-41a1-bfae-cb580dc9991b.jsonl` (worktree `om-10-corrections`). Driven through `POST /api/turn` of `pnpm dev`.

Order "2 coca cola zero grande, 1 bolsa de carbon, queso port salut, 1 kg de yerba playadito y un fernet branca": a question on the yerba, answered "la 1"; Playadito suave was unavailable in the Branch, so the first cart has 4 lines and the block Note `No conseguí "1 kg de yerba playadito": no hay ninguno disponible en tu sucursal`. Total $39878.80.

Correction 1, "cambiá el carbón por uno de 5 kg y el queso que sea Sancor" (17.7 s of steps):

| Mark | Line | Product | Qty | Total |
| --- | --- | --- | --- | --- |
| | 2 coca cola zero grande | Gaseosa cola Coca Cola Zero 2,25 lts | 2 | $12000.00 |
| Cambiado | cambiá el carbón por uno de 5 kg | Briquetas de carbón 5 kg. | 1 | $8000.00 |
| Cambiado | el queso que sea Sancor | Queso Port Salut La Pauilna tradicional x kg | 1 | $2679.80 |
| | un fernet branca | Fernet Branca Mundial 2026 750 ml | 1 | $18900.00 |

The queso line has the call 2 Note "No hay Port Salut Sancor; te dejo otras marcas…"; no block Note (the yerba Note was not repeated). Total $41579.80.

Correction 2, "la coca mejor de 1,5, sacá el fernet y agregá 2 paquetes de fideos tirabuzón" (16.0 s):

| Mark | Line | Product | Qty | Total |
| --- | --- | --- | --- | --- |
| Cambiado | la coca mejor de 1,5 | Gaseosa cola Coca Cola Zero 1,75 lts | 2 | $10500.00 |
| | cambiá el carbón por uno de 5 kg | Briquetas de carbón 5 kg. | 1 | $8000.00 |
| | el queso que sea Sancor | Queso Port Salut La Pauilna tradicional x kg | 1 | $2679.80 |
| Nuevo | 2 paquetes de fideos tirabuzón | Fideos tirabuzones Carrefour classic 500 g. | 2 | $2529.80 |

Block: "Saqué: un fernet branca". The coca line has "No hay de 1,5 l; llevo 1,75 l" and a call 2 Note "Tomé 'la coca mejor' como Coca Cola Zero…". Total $23709.60.

Then "agregá una coca cola normal de 2,25" (one `Nuevo` line) and the ambiguous "cambiá la coca por una chica": the reply was the question "¿Cuál coca querés cambiar por una chica, la zero de 1,75 o la normal de 2,25?" with no cart; "la normal" gave a cart with only that line `Cambiado` (Coca Cola sabor original 1,75 lts) and the zero kept as it was.

Seen, not fixed here (outside this ticket): call 2 kept "Briquetas de carbón" as a Fit for carbón; `read-reply` copied "la coca mejor de 1,5" as `original`, which call 2 then read as a product word; "una chica" came back as size 1.5 l instead of `smallest`.

