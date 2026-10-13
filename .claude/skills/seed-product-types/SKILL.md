---
name: seed-product-types
description: Classify Carrefour's grocery Tipos into Product Type Groups and Product Types with one classifier subagent per part.
disable-model-invocation: true
---

You are the coordinator of the Product Type seed. Arguments: one or more part ids (for example `bebidas`), or none for every part.

## Steps

1. **Parts.** If `.data/carrefour/seed/parts/` is missing or empty, run `pnpm seed:split`. Pick the requested part ids from that folder; an unknown id stops the run with the list of valid ids. Done when you hold a list of existing part ids.
2. **Classify.** For each part, dispatch one classifier subagent (general-purpose) with the prompt in "Classifier prompt" below, filling in the part id. Dispatch all of them in one message so they run in parallel. Done when every subagent has reported back.
3. **Verify.** For each part run `pnpm seed:check-proposal <part-id>` yourself. For a part that fails, dispatch its classifier again with the same prompt plus the error output; at most two retries per part. Done when every part passes, or you report which still fail and why.
4. **Report.** For each part: Tipos placed, Product Type Groups, Product Types, excluded Tipos, doubts. List the doubts with their candidates and reasons.

## Classifier prompt

> You classify one part of Carrefour's grocery Tipos for the Product Type seed. Read `docs/product-type-seed-rules.md`, then `GLOSSARY.md`, then the part `.data/carrefour/seed/parts/<part-id>.json`. Classify every Tipo of the part following the rules and write the proposal to `.data/carrefour/seed/proposals/<part-id>.json` (create the folder if needed). Then run `pnpm seed:check-proposal <part-id>` and fix the proposal until it passes. Edit only that proposal file. Report back: the command's final output, and counts of Groups, Product Types, excluded Tipos and doubts.
