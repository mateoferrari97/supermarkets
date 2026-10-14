# 04: Reword Items with no match, then ask what the Owner means

**What to build:** An Item the LLM answers `none` for is reworded once by the LLM and resolved again; if it still has no match it becomes the question "¿a qué te referís?" in the order's questions message, and the Owner's free-text answer is resolved as a new phrase. See `.scratch/order-resolution/spec.md` (Resolving an Item).

**Blocked by:** 03

**Status:** resolved

- [x] The LLM port has a task that rewords an Item with no match.
- [x] A `none` answer triggers exactly one rewording and one more resolution.
- [x] A second `none` becomes "¿a qué te referís?"; the Owner's answer to it is resolved like a new Item phrase.
- [x] Tested with a fake LLM through the entry points.
- [x] `pnpm check` exits 0.

## Comments

The `reword-item` task (`prompts/order-resolution/reword-item.md`, with the tree) receives the Item and its evidence and returns a new `phrase`. A `none` answer, or one left with no known ids, triggers one rewording and one more resolution of the reworded phrase with fresh evidence; the Item keeps the phrase the Owner wrote. A second `none` leaves the Item pending with no candidates, and the questions message asks `N. No encontré "<phrase>". ¿A qué te referís?`; the line about answering with numbers is left out when no question has options.

The `map-answer` output gained the kind `rephrased` and a `phrase` field (null otherwise) for questions with no options. A rephrased Item is resolved like a new Item: its phrase is replaced by the Owner's words, quantity, brand, terms and vague words are kept, and it goes through the same resolution and single rewording, so it can end resolved, asked with options, or asked again what the Owner means.

Because a new phrase needs the BM25 index, `createOrderResolver` now returns `{ resolveOrder, answerQuestions }`, and the standalone `answerQuestions(resolution, answerText, dependencies)` takes the full dependencies like `resolveOrder`.

Real runs on 2026-10-13:
- "un destornillador": none, reworded, none again, then "¿A qué te referís?"; "nada, dejalo" kept the question (5 sessions, 19.5 s, US$ 0.0065). The Owner cannot drop an Item from the order yet.
- "un destornillador y yerba", answer "perdón, quise decir dulce de leche": the Item became Dulce de leche, quantity 1 kept. 7 sessions, 21.5 s, US$ 0.0028.
- "una birra, yerva y unas criollitas truchas": resolved without rewording (birra to the Cerveza Group, yerva to Yerba, criollitas ambiguous between Tostadas and Crackers); rewording only runs on `none`.
- Full eval set: 10/11 hits, only the expected `conos-de-queso` miss. 24 sessions, 89.0 s, US$ 0.0065.
