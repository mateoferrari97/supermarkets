# 06: Item module owns size/quantity grammar and measure rounding

**What to build:** The Item module (order-matching) owns the text grammar of a line's size and quantity and turns a line's fields into an Item or a parse failure. It exposes the patterns, and the Claude Code adapter's output schema is built from them, so the structured-output constraint sent to Claude Code and the parser accept the same strings. One rounding of measures, to thousandths of the base unit (ml, g), is shared by Item parsing, Catalog Snapshot sizes and Candidates, so "the same size" means the same everywhere.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Size and quantity text formats are defined once, in the Item module
- [ ] The adapter's zod schema is built from the Item patterns; no second regex remains
- [ ] One rounding function is used by Item parsing, Catalog Snapshot sizes and Candidates
- [ ] One table of line texts to Items or failures covers every accepted and rejected format
- [ ] A test checks that the adapter schema accepts exactly what the parser accepts
- [ ] `pnpm check` is green
