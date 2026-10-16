# 15: Notes to the Owner

Type: grilling
Status: resolved
Blocked by: 04, 05, 06, 11, 13

## Question

How are the notes to the Owner joined in the cart message: the note of call 1 for an ignored card or preference, the notes of call 2 (brand not found, a word read differently), the notes of code (size taken as "grande", exact size missing, quantity rounded to the Sale Step, units of a product sold by weight, substitution at simulation, Item dropped after two questions) and the warning on every cart to empty the Carrefour cart first? Where does each note sit (next to its line or in a block), in what order, who writes its words (LLM or code templates), and how does a later cart mark the changed lines?

## Answer

Agreed with the Owner on 2026-10-15. The term **Note** joins `GLOSSARY.md`; the build renames `notices` to `notes`.

- **Notes next to their line.** A Note about one Item sits under its cart line, one per row: first the Note of call 2 (brand not found, a word read differently), then the Notes of code in flow order: size ("grande" with no packaged Fit, exact size missing), Sale Step rounding, units of a product sold by weight, substitution at simulation, and the quantity promotion hint ("Llevando 2 sale … c/u en vez de …"), which stays.
- **A block for Notes with no line**, after the table, in this order: Items not got (dropped after two questions, or every Fit unavailable at simulation), Items the Owner removed ("Saqué: carbón"), and the ignored card or preference. The table has no "Sin producto" rows any more. When every Fit is unavailable at simulation the Item goes to the block with a Note; no question is asked.
- **Who writes the words.** Notes of code are fixed Spanish templates in code. Notes of call 2 are shown as the LLM wrote them. Call 1 returns `ignoredPreference` as a boolean and code writes the fixed sentence, as today (`src/core/product-selection/pick-products.ts:61-63`). No extra LLM call writes or joins Notes.
- **No Note for a default** the Owner left open (`common`, `minimum`, the standard variant): only when code departs from what the Owner said. The Note "El precio cambió al armar el carrito" (`pick-products.ts:208`) and the Note "La búsqueda no lo encontró: lo elegí del catálogo" (`pick-products.ts:128`) are deleted with the old flow.
- **The warning to empty the Carrefour cart** is not a Note: a fixed sentence on every cart, right before the link.
- **Later carts** show every line; added Items are marked "Nuevo" and corrected ones "Cambiado", without the previous product. A Note shows in the first cart that holds its Item: the first cart gathers the Notes of every earlier turn, and a later cart shows only the Notes of its marked lines and of its own block.
- **Layout stays** as today's `CartView` (`src/app/chat.tsx:260-315`): Notes under the line, the block after the table.
