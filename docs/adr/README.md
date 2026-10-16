# Architecture Decision Records

One file per decision, numbered in order, with a `Status` front matter of `proposed`, `accepted`, `deprecated` or `superseded by ADR-NNNN`. A new ADR takes the next number and is added here.

- [0001](0001-own-product-types-mapped-from-each-online-store.md): Own Product Types, mapped from each Online Store's classification
- [0002](0002-llm-translates-preferences-code-picks-products.md): The LLM translates the Owner's preference into a Selection Policy; code picks the products
- [0003](0003-resolve-items-with-lexical-evidence-and-an-llm-over-a-product-type-tree.md): Resolve each Item with lexical evidence and an LLM over a tree of Product Types
- [0004](0004-each-order-starts-from-free-text-and-asks-when-in-doubt.md): Each order starts from free text, asks when in doubt, and remembers nothing
- [0005](0005-pick-products-from-live-search-and-checkout-simulation.md): Pick products from live search and checkout simulation, not from the Catalog Snapshot
- [0006](0006-layers-as-rings-with-features-inside-the-core.md): Layers as rings with features inside the core; only the LLM and the Online Store are ports
- [0007](0007-next-js-and-vitest-on-node-24-running-locally.md): Next.js and Vitest on Node 24, running locally only
- [0008](0008-the-owner-orders-in-a-local-chat-that-replaces-the-order-command.md): The Owner orders in a local chat that replaces the order command
- [0009](0009-claude-md-is-a-short-map-into-a-content-first-docs-folder.md): `CLAUDE.md` is a short map into a content-first `docs/`; `.scratch/` is never linked
- [0010](0010-check-the-knowledge-base-mechanically-in-pnpm-check.md): Check the knowledge base mechanically in `pnpm check`
- [0011](0011-no-payment-card-or-preference-for-now.md): No Payment Card or preference for now; one fixed Selection Policy picks the products
- [0012](0012-match-items-to-catalog-products-with-two-llm-calls-around-a-search.md): Match Items to catalog products with two LLM calls around a search
- [0013](0013-in-a-plan-the-llm-proposes-seen-products-and-the-owner-confirms.md): In a Plan the LLM proposes products it saw, code checks them, and the Owner confirms
