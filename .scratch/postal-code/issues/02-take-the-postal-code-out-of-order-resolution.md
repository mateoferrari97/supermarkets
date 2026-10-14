# 02: Take the postal code out of Order Resolution

**What to build:** The order text is only about what the Owner buys. `split-order` no longer returns a postal code, the order's questions never ask for one, and `map-answer` no longer handles postal code answers. A postal code written in the order ("envío a 1425") is neither read nor turned into an Item. Order Resolution stays offline (ADR 0003). The Glossary entry for the Online Store location says it follows from the postal code the Owner gives before the order. See `.scratch/postal-code/spec.md`.

**Blocked by:** 01

**Status:** ready-for-agent

- [x] `split-order` returns no postal code, and an order text with "envío a 1425" gives no Item for it.
- [x] The order's questions message never asks for the postal code, even when the order has none; the postal code question kind is removed from `map-answer`.
- [x] The resolved order no longer carries a postal code; nothing reads it from Order Resolution.
- [x] Order Resolution tests updated: no postal code question, and the split result has no postal code; tested with the fake LLM.
- [x] `GLOSSARY.md` updated for the Online Store location.
- [x] `pnpm check` exits 0.
