---
name: seed-product-types
description: Classify Carrefour's grocery Tipos into Product Type Groups and Product Types with one classifier subagent per part, then consolidate every proposal into the vocabulary and the Carrefour mapping.
disable-model-invocation: true
---

You are the coordinator of the Product Type seed. Arguments: one or more part ids (for example `bebidas`) to classify again, or none to classify every part that has no valid proposal yet and consolidate.

## Steps

1. **Parts.** If `.data/carrefour/seed/parts/` is missing or empty, run `pnpm seed:split` (it stops with a clear message when the Catalog Snapshot is missing). With part ids, pick those from that folder; an unknown id stops the run with the list of valid ids. With none, pick every part for which `pnpm seed:check-proposal <part-id>` fails. Done when you hold the list of part ids to classify (it may be empty).
2. **Classify.** For each picked part, dispatch one classifier subagent (general-purpose) with the prompt in "Classifier prompt" below, filling in the part id. Dispatch all of them in one message so they run in parallel. A redone part overwrites only its own proposal in `.data/carrefour/seed/proposals/`. Done when every subagent has reported back.
3. **Verify.** For each classified part run `pnpm seed:check-proposal <part-id>` yourself. For a part that fails, dispatch its classifier again with the same prompt plus the error output; at most two retries per part. Done when every part passes, or you report which still fail and why.
4. **Consolidate.** Run `pnpm seed:consolidate`. It merges every valid proposal with the decisions in `.data/carrefour/seed/decisions.json` and writes `vocabulary/product-types.json`, `vocabulary/carrefour-tipos.json`, the remaining doubts `.data/carrefour/seed/doubts.json` and the tree summary `.data/carrefour/seed/summary.md`. Read the summary and the doubts with the "Consolidation" section of `docs/product-type-seed-rules.md` in mind, append decisions (see "Decisions") and run it again, until it exits 0 and you find no more same-meaning Groups or Product Types and no doubt you can place. It refuses to write while a part has no proposal (`--partial` overrides this). Read every `warning:` line: a decision that overrides a placement a part made with confidence (expected for a deliberate correction, suspicious after a redone part), a doubt left with fewer than two candidates, or an id named differently by two parts. When a redone part makes an old decision fail or a warning shows it is stale, fix or drop that decision. Done when `pnpm seed:consolidate` exits 0 after your last decision and every warning is understood.
5. **Report.** Run `pnpm seed:coverage` and `pnpm check`. Report: per classified part, Tipos placed, Groups, Product Types, excluded Tipos and doubts; the consolidation counts; the decisions you added, grouped by kind; the coverage report; the number of remaining doubts.

## Decisions

`.data/carrefour/seed/decisions.json` is a JSON array applied in order on top of the proposals; never edit a proposal to consolidate. Ids may name an id that an earlier merge removed; it follows the merge. Group ids and Product Type ids are separate: the same id may not be a Group in one part and a Product Type in another. `excluded` is reserved.

- `{ "op": "merge", "from": "<id>", "into": "<id>" }`: two Groups (the Product Types of `from` move into `into`) or two Product Types (the Tipos and doubt candidates of `from` move to `into`). `from` disappears.
- `{ "op": "move", "productType": "<id>", "group": "<group id>" }`: puts a Product Type in another Group. Needed when two parts put the same Product Type id in different Groups that should not merge.
- `{ "op": "rename", "id": "<id>", "name": "<name>" }`: changes a Group's or Product Type's name; the id stays. An id that was merged away cannot be renamed; rename the id it was merged into.
- `{ "op": "addGroup", "id": "grupo-<slug>", "name": "<name>" }` and `{ "op": "addProductType", "id": "<slug>", "name": "<name>", "group": "<group id>" }`: new Group or Product Type.
- `{ "op": "place", "tipo": "<Tipo>", "productType": "<id>" }`: maps a Tipo, wherever it was (doubt, excluded or another Product Type).
- `{ "op": "exclude", "tipo": "<Tipo>", "reason": "<razón en español>" }`: excludes a Tipo.

A Product Type with no Tipo after the decisions is left out of the vocabulary, but stays available as a doubt candidate.

## Classifier prompt

> You classify one part of Carrefour's grocery Tipos for the Product Type seed. Read `docs/product-type-seed-rules.md`, then `GLOSSARY.md`, then the part `.data/carrefour/seed/parts/<part-id>.json`. Classify every Tipo of the part following the rules and write the proposal to `.data/carrefour/seed/proposals/<part-id>.json` (create the folder if needed). Then run `pnpm seed:check-proposal <part-id>` and fix the proposal until it passes. Edit only that proposal file. Report back: the command's final output, and counts of Groups, Product Types, excluded Tipos and doubts.
