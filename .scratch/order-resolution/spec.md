Status: ready-for-agent

# Resolve an order's free text into Product Types

## Problem Statement

The Owner wants to write a supermarket order the way they would say it ("necesito leche, dos cocas grandes y nada de huevos") and get each thing resolved to a Product Type of the tree, so that a later step can pick products. The Product Type tree and the Carrefour mapping now exist, but nothing turns free text into Items, nothing finds which Product Type an Item means, and nothing asks the Owner when the text is not enough. The Owner also has no way to know whether the resolution is good: there is no eval set, and running one must not depend on paying for Claude API calls from code; it should run on Claude Code sessions under the Owner's plan.

## Solution

One entry point takes the order text and returns every Item resolved to a Product Type, plus one message of questions for whatever is still in doubt (ADR 0004). The Owner answers in free text; a second entry point applies the answer and returns the updated order, asking again only what still does not match. Inside, the order is split into Items by an LLM; each Item gets evidence from a BM25 search over the product names of the Catalog Snapshot; an LLM resolves the Item over the whole Product Type tree with that evidence (ADR 0003); terms and vague words are checked against the Catalog Snapshot by code.

Every LLM step goes through one LLM port. Its real adapter opens a headless Claude Code session (`claude -p` with a pinned model, a JSON schema for the answer and a spending cap), so no code calls the Claude API directly. A fake adapter with fixed answers drives the tests in `pnpm check`. An eval set of phrases written by the Owner, each with its expected result, runs through the same entry point on Claude Code sessions with one command and reports hits, misses and cost.

## User Stories

1. As the Owner, I want to write an order as one free-text message without separators, so that ordering feels like talking.
2. As the Owner, I want the order split into Items, so that each thing I asked for is handled on its own.
3. As the Owner, I want quantities understood ("dos", "medio", "un par", "2,25 l"), so that I do not have to write numbers in a fixed format.
4. As the Owner, I want things I rule out ("nada de huevos") not to become Items, so that they are never added.
5. As the Owner, I want a brand I name ("Cindor") kept with its Item, so that the later product choice respects it.
6. As the Owner, I want a brand I name to apply to that order only, so that nothing is remembered behind my back.
7. As the Owner, I want words that narrow a product ("sin TACC", "sachet", "2,25", "conos") kept as terms, so that only products whose name contains them are considered later.
8. As the Owner, I want a term that matches no product of the chosen Product Type to become a question, so that I am not silently given something else.
9. As the Owner, I want vague words ("grande", "chico") marked instead of interpreted, so that the system does not guess my size.
10. As the Owner, I want the options for a vague word built from the Catalog Snapshot (the Coca-Cola sizes actually in stock), so that I am never offered something that does not exist.
11. As the Owner, I want an Item that clearly names one Product Type resolved without a question, so that clear orders go straight through.
12. As the Owner, I want a brand-only Item ("Cindor") resolved through the products that carry that name, so that brands work even though the tree has no brands.
13. As the Owner, I want a loose word that names a Product Type Group ("leche") to become a question listing its Product Types, so that I choose entera or descremada.
14. As the Owner, I want an ambiguous Item to become a question with the candidate Product Types, so that I decide instead of the system guessing.
15. As the Owner, I want an Item with no match retried once with a rewording, so that a small phrasing problem does not reach me.
16. As the Owner, I want an Item that still has no match to become "¿a qué te referís?", so that I can rephrase it.
17. As the Owner, I want every doubt of the order asked in one message, so that I answer once instead of item by item.
18. As the Owner, I want each question to show numbered options, so that I can answer with a number or in words.
19. As the Owner, I want to answer in free text ("la 2", "entera", "cualquiera"), so that answering is natural.
20. As the Owner, I want "cualquiera" to leave the choice among the offered options to the Selection Policy, so that I can skip decisions I do not care about.
21. As the Owner, I want an answer that does not match any offered option asked again, so that nothing is resolved on a misunderstanding.
22. As the Owner, I want answered Items to stay resolved while I answer the rest, so that I never answer the same thing twice in one order.
23. As the Owner, I want the result to list every Item with its Product Type, quantity, terms and brand, so that the next step (picking products) has what it needs.
24. As the Owner, I want Product Type ids in the result to always exist in the tree, so that a model mistake cannot invent a Product Type.
25. As the Owner, I want excluded Tipos never offered as candidates, so that non-grocery things do not appear.
26. As the Owner, I want nothing stored between orders, so that each order starts clean (ADR 0004).
27. As the Owner, I want the LLM steps to run on Claude Code sessions, so that they use my Claude plan and not a separate API bill.
28. As the Owner, I want each LLM step to use a pinned model, so that results are comparable between runs.
29. As the Owner, I want each LLM step to answer in a fixed JSON shape that code validates, so that a malformed answer fails loudly instead of being half-used.
30. As the Owner, I want a spending cap per session, so that a runaway call cannot cost much.
31. As the Owner, I want to write the eval set as phrases with their expected result, so that I decide what "correct" means.
32. As the Owner, I want an eval case to expect either a Product Type, a question over given Product Types or Group, or "no Item" for exclusions, so that every behaviour above can be checked.
33. As the Owner, I want an eval case to be able to expect terms, quantity and brand, so that splitting is checked too.
34. As the Owner, I want to run the whole eval set with one command, so that checking quality is cheap in effort.
35. As the Owner, I want the eval report to list hits, misses with what came back, and errors, so that I can see where resolution fails.
36. As the Owner, I want the eval report to state the time and cost of the run, so that I know what a run costs.
37. As the Owner, I want to run a single eval case or a subset, so that I can iterate on one failure.
38. As the Owner, I want eval runs saved with their date, so that I can compare a new run with an old one.
39. As the Owner, I want the eval set kept out of `pnpm check`, so that the check stays free, fast and deterministic.
40. As a developer, I want the whole resolution behind one entry point with the LLM as an injected port, so that tests drive it end to end with a fake LLM.
41. As a developer, I want the BM25 search to work offline on the local Catalog Snapshot, so that evidence is deterministic and testable.
42. As a developer, I want a clear message when the local Catalog Snapshot is missing, so that I know to run `pnpm carrefour:catalog`.
43. As a developer, I want the prompts sent to Claude Code sessions kept as plain files in the repo, so that they can be tuned without changing code.
44. As a developer, I want the tree and the evidence passed to the LLM in a stable order, so that prompt caching applies and runs are comparable.
45. As a future maintainer, I want the eval set results to be the evidence for changing model or prompts, so that decisions are backed by data (ADR 0003 consequences).

## Implementation Decisions

- **Entry points (the one test seam).** `resolveOrder(orderText, dependencies)` returns an Order Resolution: the Items, each either resolved (Product Type id, quantity, terms, brand) or pending with a question; and the questions message. `answerQuestions(resolution, answerText, dependencies)` returns the updated Order Resolution. Dependencies are the Catalog Snapshot products, the vocabulary, the Carrefour mapping and the LLM port. Nothing is persisted.
- **LLM port.** One function per LLM task, each taking a typed input and returning output validated by a zod schema: split the order into Items; resolve one Item over the tree with evidence; reword an Item with no match; map a free-text answer onto the offered options. A schema failure is an error, not a retry with a guess.
- **Claude Code session adapter.** Runs the Claude Code CLI in print mode with a pinned model (Haiku 5.5, as ADR 0003 decides), the task's prompt file as system prompt, the task's JSON schema for structured output, no tools, no session persistence, and a per-call budget cap; it parses the JSON result and its cost. No code calls the Claude API directly. A later API adapter can implement the same port.
- **Fake adapter.** Returns scripted answers keyed by task and input; used by unit tests.
- **Splitting (ADR 0004).** The LLM returns Items with phrase, quantity, terms, vague words and brand; exclusions are dropped.
- **Evidence (ADR 0003).** A BM25 index over the names of the grocery products of the Catalog Snapshot that have a mapped Tipo, built once per run; the top products for an Item's phrase and brand are given to the LLM with their Product Type. Excluded and unmapped Tipos are left out.
- **Resolving an Item (ADR 0003).** The LLM receives the Item, the evidence and the whole tree (Groups and Product Types, stable order) and answers `match`, `ambiguous` or `none` with candidate ids. Code drops ids not in the tree; a Group id or an `ambiguous` answer becomes a question listing Product Types; `none` is reworded once and retried, then becomes "¿a qué te referís?".
- **Terms and vague words.** Code checks each term against the names of the resolved Product Type's products; a term with no match becomes a question. Options for a vague word are built by code from the Catalog Snapshot (distinct sizes in stock for that Product Type and brand), never by the LLM.
- **Questions round.** All pending Items go into one message with numbered options. The answer is mapped by the LLM onto the offered options only; "cualquiera" marks the Item as resolved to the offered set, left to the Selection Policy; an answer that maps to nothing keeps the question.
- **Eval set.** A committed file of cases written by the Owner: the order text and the expected outcome per Item (Product Type id, or a question whose options include given ids or a Group, or no Item; optionally quantity, terms, brand). A runner command executes every case (or a filter) through `resolveOrder` with the Claude Code adapter, compares, prints a report (hits, misses with actual output, errors, total time and cost) and writes the run under the git-ignored data folder. Cases whose expected ids are missing from the vocabulary fail validation in `pnpm check` (no LLM needed).
- **Prompts** are Markdown files in the repo, one per LLM task, in English, with the Owner-facing question texts in Spanish.

## Testing Decisions

- A good test drives `resolveOrder` and `answerQuestions` with a small hand-made catalog, vocabulary and mapping and a fake LLM, and checks the returned Order Resolution; it does not check prompts or internal calls.
- Tested through the entry points: clear match; Group becomes a question; ambiguous becomes a question; ids not in the tree are dropped; `none` retried once then "¿a qué te referís?"; exclusions are not Items; a term with no match becomes a question; vague-word options come from the catalog; "cualquiera"; an unmatched answer keeps the question; answered Items stay resolved.
- The BM25 search is tested on its own only if its ranking needs cases the entry points cannot express; otherwise through the entry points.
- The Claude Code adapter is tested by feeding it recorded CLI outputs (valid, schema-invalid, error, over budget) through an injected process runner; it is never run in `pnpm check`.
- Eval set validation (shape, ids exist) runs in `pnpm check`; the eval run itself does not.
- Prior art: `src/product-types/validate.test.ts` and `src/product-type-seed/consolidate.test.ts` (data in, result out, `node:test` via `pnpm test`).

## Out of Scope

- Picking products and the Selection Policy (ADR 0002).
- Building the Carrefour cart link and the `orderForms/simulation` check.
- Any interface beyond a command-line entry for manual use and the eval runner (no chat, WhatsApp or web).
- A direct Claude API adapter.
- Per-Owner memory, defaults or order history (ADR 0004).
- Embeddings, an alias table, splitting catch-all Tipos (ADR 0003 considered options).
- Online Stores other than Carrefour.

## Further Notes

- ADR 0003 names Claude Haiku 5.5 "in a cached prompt"; running it through Claude Code sessions keeps the model and moves the transport. If the eval set shows the session overhead or caching makes runs too slow or costly, a direct API adapter can be added behind the same port; record that in an ADR if it happens.
- The vocabulary file is about 140k characters, so the tree in the prompt should send only ids, names and Groups, and keep the order stable.
- The local Catalog Snapshot holds 105,336 products; the index covers only grocery products with a mapped Tipo.
- Haiku takes no `temperature`, so the same text can resolve differently between runs (ADR 0002); the eval report should make repeated runs comparable.
