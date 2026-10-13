---
Status: accepted
---

# The LLM translates the Owner's preference into a Selection Policy; code picks the products

The same request on the same Catalog Snapshot must give the same cart, for any Owner who sends it. An LLM choosing products does not meet that: the same prompt at temperature 0 gave 80 different completions in 1,000 runs (Thinking Machines, cited in `.scratch/carrefour-cart/research/preference-to-selection-architectures.md`). So the LLM only translates: the Owner's words into a Product Type, and the Owner's preference ("por promociones", "por marca y promos dentro de esas marcas") into a Selection Policy built from fixed rules. Both translations are stored and reused. Plain code then runs the rules in order: brand (strict or preferred), savings first (promotion or direct discount), lowest effective price per unit of measure with the promotion applied at the quantity bought, and a fixed tie-break by `itemId`, with a cap on extra units a promotion may add. A preference no rule can express is reported back to the Owner, and the rest of the request goes ahead. Before the cart link is built, `orderForms/simulation` confirms stock and final prices for the chosen products; an unavailable one is replaced by the next candidate of the same Product Type.

## Considered Options

- **The LLM picks among the candidates (with or without caching its answer).** Handles any preference, but is not reproducible across Snapshots, is slower and costlier per request, and leaves "2do al 70%" arithmetic to the model.
- **LLM reranking or learned ranking.** Same reproducibility problem, or needs training data we do not have.
- **The LLM handles only what the rules cannot express.** Rejected for now: the Owner is told instead, and a new rule is added when a preference keeps coming up.
