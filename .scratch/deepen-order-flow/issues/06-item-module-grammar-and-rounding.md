# 06: Item module owns size/quantity grammar and measure rounding

**What to build:** The Item module (order-matching) owns the text grammar of a line's size and quantity and turns a line's fields into an Item or a parse failure. It exposes the patterns, and the Claude Code adapter's output schema is built from them, so the structured-output constraint sent to Claude Code and the parser accept the same strings. One rounding of measures, to thousandths of the base unit (ml, g), is shared by Item parsing, Catalog Snapshot sizes and Candidates, so "the same size" means the same everywhere.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Size and quantity text formats are defined once, in the Item module
- [x] The adapter's zod schema is built from the Item patterns; no second regex remains
- [x] One rounding function is used by Item parsing, Catalog Snapshot sizes and Candidates
- [x] One table of line texts to Items or failures covers every accepted and rejected format
- [x] A test checks that the adapter schema accepts exactly what the parser accepts
- [x] `pnpm check` is green

## Comments

- `item.ts` exports `SIZE_PATTERN`, `QUANTITY_PATTERN`, `roundMeasure` (thousandths of ml or g) and `parseLine`, which returns an Item or a failure. The parsers test the patterns first, so the grammar is written once.
- `lineSchema` in `llm-output-schemas.ts` uses the patterns (the JSON schema sent to Claude Code keeps the same pattern strings as before) plus a refine with the parsers, so "0 ml" or "0.0001 g" fail the schema too. Item parsing moved from 1e-6 to 1e-3 precision.
- `catalog-product.ts` and `candidates.ts` use `roundMeasure`; the local `round` in `candidates.ts` is gone.
- `item-line-cases.ts` holds the one table, run by `item.test.ts` and `llm-output-schemas.test.ts`.
