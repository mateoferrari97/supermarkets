# 03: Ask about Groups and ambiguous Items and apply the answers

**What to build:** When an Item names a Product Type Group ("leche") or is ambiguous, the Order Resolution holds a question with numbered Product Type options, and every question of the order goes into one message. The Owner answers in free text; `answerQuestions` maps the answer onto the offered options, resolves those Items, keeps the rest asked, and "cualquiera" leaves the choice among the offered options to the Selection Policy. The order command becomes interactive. See `.scratch/order-resolution/spec.md` (Questions round).

**Blocked by:** 01

**Status:** resolved

- [x] A Group answer, or an `ambiguous` answer, becomes a question listing Product Types; no excluded Tipo or unknown id appears as an option.
- [x] All pending Items are asked in one message with numbered options, in Spanish.
- [x] The LLM port has a task that maps a free-text answer onto the offered options only.
- [x] `answerQuestions` resolves the Items answered, keeps resolved Items untouched, keeps the question for an answer that maps to nothing, and handles "cualquiera".
- [x] Tested with a fake LLM through the entry points.
- [x] The order command asks the questions on the terminal and applies the answers on real Claude Code sessions until nothing is pending.
- [x] `pnpm check` exits 0.

## Comments

A resolved Item now holds `productTypes`, a list: one Product Type when the Item or the Owner named one, several when the Owner picked more than one option or answered "cualquiera", leaving the choice among them to the Selection Policy. The Order Resolution carries `message`, the Spanish questions message built by code from every pending Item with candidates (Group or ambiguous), or `null` when nothing is asked; options are the candidates, which only ever come from the vocabulary, so excluded Tipos and unknown ids cannot appear. Items pending with no candidates (`none`) are not asked yet; ticket 04 adds "¿a qué te referís?".

`answerQuestions(resolution, answerText, { llm })` sends the numbered questions and options with the answer to the `map-answer` task (`prompts/order-resolution/map-answer.md`), whose output is `chosen` with option numbers, `any`, or `unclear` per question. Code ignores unknown question or option numbers; a question whose answer picks no offered option stays pending and is asked again in the new message.

`pnpm order "<text>"` prints the Items, then the message, reads an answer per round from stdin (lines, so a piped answer file works) and stops when nothing is asked or on an empty answer. `productType` eval expectations now require exactly that one Product Type in `productTypes`.

Real runs on 2026-10-13:
- "necesito leche, una coca y conos de queso", answer "la 1, y la coca la de 2,25": leche to option 1, Bebida láctea (the options follow the vocabulary order, so option 1 is Bebida láctea, not Leche entera). 5 sessions, 15.2 s, US$ 0.0025.
- "leche y un yogur", answers "la de siempre" (both questions kept) then "entera, y el yogur me da igual": Leche entera, and yogur resolved to its six Product Types. 5 sessions, 14.1 s, US$ 0.0014.
- `pnpm order:eval cindor ticket-01`: 2/2 hits.
