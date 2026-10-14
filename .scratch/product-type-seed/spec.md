Status: resolved

# Seed the Product Type tree and the Carrefour Tipo mapping

## Problem Statement

Resolving an Item (ADR 0003) needs a tree of Product Types (Product Type Groups over Product Types) and a mapping from each Carrefour `Tipo de producto` to a Product Type. Neither exists. The grocery scope alone has 2,203 Tipos across 10 departments, with near-duplicates ("Pan lactal", "Pan de molde", "Pan de mesa"), catch-alls ("Snacks") and Tipos nobody buys at a supermarket ("Cordones", "Leche balsámica"). Classifying them by hand is too slow, and reviewing 2,203 proposals one by one is too much work for the Owner.

## Solution

The Owner opens one Claude Code session and runs a project skill. That session is the coordinator. It splits the grocery Tipos of the local Catalog Snapshot into about 12 parts, starts one classifier subagent per part in parallel, and each subagent proposes Product Type Groups, Product Types and excluded Tipos for its part, marking every Tipo it is unsure about as a doubt with ranked candidates. The coordinator then consolidates all proposals: it merges Groups and Product Types that mean the same thing across parts, unifies ids, and places as many doubts as it can now that it sees the whole tree. Only the doubts that remain go to the Owner, in batches, with candidates and examples; the Owner answers in plain words and the coordinator applies the answers. A readable summary of the whole tree is also produced for the Owner to skim if they want. The result is the Product Type vocabulary and the Carrefour mapping, committed to the repo and validated by `pnpm check`.

No Claude API calls are made by code: all classification is done by Claude Code sessions under the Owner's plan.

## User Stories

1. As the Owner, I want to start the whole seed from one Claude Code session with one command, so that I do not have to orchestrate many sessions by hand.
2. As the Owner, I want the seed to use the Catalog Snapshot already on disk, so that I do not download the catalog again.
3. As the Owner, I want the seed to fail early with a clear message when the local Catalog Snapshot is missing, so that I know to run `pnpm carrefour:catalog` first.
4. As the Owner, I want only the 10 grocery departments to be classified, so that the seed matches the agreed scope.
5. As the Owner, I want products without a Tipo to be ignored, as ADR 0001 says, so that they do not create noise.
6. As the Owner, I want each Tipo to be classified exactly once, in the department where it has most products, so that no Tipo gets two answers.
7. As the Owner, I want the Tipos split into parts named after departments I recognise, so that I can tell what each part covers.
8. As the Owner, I want large departments such as Almacén split into smaller parts, so that each subagent works on a manageable amount.
9. As the Owner, I want each Tipo in a part to carry its product count, available product count, main Familias, measure units and a few example product names, so that the classifier can understand what the Tipo really holds.
10. As the Owner, I want the classifier subagents to run in parallel, so that the seed finishes quickly.
11. As the Owner, I want every classifier subagent to follow the same written rules, so that parts are classified consistently.
12. As the Owner, I want the rules to say that Product Types group Tipos I would accept as replacements for each other, so that the tree matches ADR 0003.
13. As the Owner, I want near-duplicate Tipos merged into one Product Type, so that "Pan lactal" and "Pan de molde" do not end up apart.
14. As the Owner, I want loose words that cover several Product Types to become Product Type Groups, so that "leche" can later turn into a question listing its Product Types.
15. As the Owner, I want concepts that span several Tipos, such as "snack dulce", to be Groups, so that a loose request finds them.
16. As the Owner, I want catch-all Tipos kept as one broad Product Type, so that the seed follows ADR 0003 and does not split by Familia.
17. As the Owner, I want Tipos that are not supermarket purchases to be excluded explicitly, so that they never appear as candidates.
18. As the Owner, I want ids that are stable lowercase slugs and names in Spanish, so that ids survive renames and names match how I talk.
19. As the Owner, I want each classifier to record a doubt instead of guessing when it is unsure, so that wrong guesses do not slip in silently.
20. As the Owner, I want each doubt to list ranked candidates, the reason for the doubt and example products, so that I can answer it quickly.
21. As the Owner, I want each classifier's proposal checked for shape and completeness, so that a broken or partial proposal is caught before consolidation.
22. As the Owner, I want a part whose proposal is invalid to be classified again, so that one bad subagent run does not spoil the seed.
23. As the Owner, I want the coordinator to merge Groups and Product Types that mean the same thing across parts, so that "Leche" exists once.
24. As the Owner, I want the coordinator to unify ids across parts, so that no two ids name the same Product Type.
25. As the Owner, I want the coordinator to place doubts it can resolve with the whole tree in view, so that I only see the hard ones.
26. As the Owner, I want only the remaining doubts asked to me, so that my review is short.
27. As the Owner, I want doubts asked in batches with numbered options, so that I can answer several at once.
28. As the Owner, I want to answer doubts in my own words ("la 2", "excluilo", "nuevo grupo Snacks salados"), so that answering is natural.
29. As the Owner, I want to be able to create a new Product Type or Group while answering a doubt, so that I am not forced into a bad option.
30. As the Owner, I want to be able to exclude a Tipo while answering a doubt, so that non-grocery Tipos can be dropped.
31. As the Owner, I want to stop the review and resume it later from the remaining doubts, so that I do not have to finish in one sitting.
32. As the Owner, I want a readable summary of the whole tree (Groups, Product Types, Tipos, product counts), so that I can skim it for mistakes the classifiers made with confidence.
33. As the Owner, I want to correct anything I see in the summary the same way I answer a doubt, so that there is one way to fix things.
34. As the Owner, I want the final vocabulary and mapping written to the repo, so that they are versioned and reviewable in git.
35. As the Owner, I want the intermediate parts and proposals kept out of git, so that the repo holds only the result.
36. As the Owner, I want `pnpm check` to fail when the vocabulary or mapping is inconsistent, so that a hand edit cannot break them unnoticed.
37. As the Owner, I want the coordinator to report coverage at the end (Tipos mapped, excluded, still unreviewed), so that I know the seed is complete.
38. As the Owner, I want the seed to be re-runnable for a single part, so that I can redo one department without redoing everything.
39. As a future maintainer, I want the classification rules in a document in the repo, so that I can see why the tree looks the way it does.

## Implementation Decisions

- **Scope.** Only the 10 grocery departments (Almacén, Desayuno y merienda, Bebidas, Lácteos y productos frescos, Carnes y pescados, Frutas y verduras, Panadería, Congelados, Limpieza, Perfumería y farmacia): 2,203 Tipos in the 2026-10-13 snapshot. A product's department is the first department it was found in. Products without a Tipo are ignored.
- **Unit of classification.** The Tipo, not the product (ADR 0001). Products appear only as examples that explain a Tipo.
- **Splitter module.** A script that reads the local Catalog Snapshot and writes the parts. Each Tipo goes to the grocery department where it has most products (ties broken by department name). Departments over about 220 Tipos are split into numbered sub-parts, keeping Tipos ordered by Sección then name so related Tipos stay together. Per Tipo it writes: name, products, available products, top Familias with counts, measure units, and up to 5 example product names. Measured sizes per department: Almacén 570 Tipos (about 98k characters), Perfumería y farmacia 265, Desayuno y merienda 258, Lácteos y productos frescos 204, Limpieza 184, Carnes y pescados 176, Frutas y verduras 170, Congelados 139, Panadería 133, Bebidas 104. Output goes under the git-ignored data folder, next to the catalog files.
- **Seed rules document.** Plain Markdown in the repo, read by every classifier and by the coordinator. It states: the two-level tree (Product Type Group over Product Types); the replacement rule for merging Tipos into one Product Type; Groups for loose words and for concepts that span Tipos; catch-alls stay one broad Product Type; exclusion for Tipos that are not supermarket purchases; id format (lowercase ASCII slug of the Spanish name, hyphen-separated); names in Spanish; every Tipo of a part appears exactly once as mapped, excluded or doubt; when unsure, record a doubt with ranked candidates instead of guessing.
- **Proposal shape** (one per part, written by its classifier, validated by a zod schema):
  - `groups`: list of `{ id, name, productTypes: [{ id, name, tipos: [tipo] }] }`
  - `excluded`: list of `{ tipo, reason }`
  - `doubts`: list of `{ tipo, candidates: [productTypeId or groupId or "excluded"], reason }`, candidates ranked best first
- **Final vocabulary** (committed): Product Type Groups and Product Types with stable ids and Spanish names; every Product Type belongs to exactly one Group; a Group may hold a single Product Type. Shared by every Online Store.
- **Final Carrefour mapping** (committed): Tipo → Product Type id, or `null` for reviewed and excluded; a Tipo absent from the mapping is unreviewed (ADR 0003).
- **Remaining doubts and tree summary.** The coordinator writes the doubts it could not place and a readable Markdown summary of the tree (Groups → Product Types → Tipos with product counts), both outside git. The doubts file is what makes the review resumable.
- **Coordinator.** A project Claude Code skill that a fresh session runs. Steps: check the Catalog Snapshot exists; run the splitter; start one classifier subagent per part in parallel, each given the rules document and its part, each writing its proposal; validate every proposal and re-run the subagent of any invalid part; consolidate (merge same-meaning Groups and Product Types across parts, unify ids, resolve doubts with the whole tree in view); write the final vocabulary, the mapping, the remaining doubts and the summary; ask the Owner the remaining doubts in numbered batches and apply each answer, including new Groups, new Product Types and exclusions; run validation and report coverage. It also accepts a single part to redo.
- **Validator module.** Used by `pnpm check` on the committed files only (the catalog is not in git): both files match their schemas; every id in the mapping exists in the vocabulary; ids are unique and well-formed; every Product Type belongs to exactly one existing Group; no Group is empty. Coverage against the Catalog Snapshot (every grocery Tipo mapped or excluded) is a separate report the coordinator runs, because it needs the local catalog.
- **No code calls the Claude API.** Classification and consolidation happen in Claude Code sessions.

## Testing Decisions

- A good test feeds a module data and checks what comes out: parts written, errors reported. It does not check how the module gets there.
- **Splitter:** given a small hand-made catalog, it writes the expected parts; each grocery Tipo lands in exactly one part, in its majority department; non-grocery departments and products without a Tipo are left out; a department over the size limit is split; examples are capped at 5.
- **Validator:** given valid files it passes; given an id in the mapping that is not in the vocabulary, a duplicate id, a malformed id, a Product Type without a Group, or an empty Group, it fails with a message naming the offending entry.
- The proposal schema is tested through the validator's shared schemas where it reuses them, not separately.
- The coordinator skill and the subagents are not unit-tested; they are exercised by running the seed.
- No tests exist in the repo yet. Add a test runner and include it in `pnpm check`, as CLAUDE.md requires.

## Out of Scope

- Resolving Items at order time (ADR 0003 and ADR 0004 layers).
- Reviewing Tipos that first appear in a later daily pass.
- Departments outside the 10 grocery ones.
- Splitting catch-all Tipos by Familia, extracted attributes per product, embeddings, an alias table.
- A database: the vocabulary and mapping stay as files until persistence is designed.
- Other Online Stores' mappings.

## Further Notes

- `tipos.json` counts Tipos across the whole catalog, not only grocery, so the splitter must read `products.json` to know each product's department.
- Some Tipos mix things a classifier will notice, for example `Leche en polvo entera` includes `Leche entera larga vida Las tres niñas 1 l.`; these are natural doubts.
- Some products sit in odd Secciones (Carbón vegetal and Leña under JUGUETERIA), which is why exclusion is decided per Tipo, never per Sección.
- The rules document is the place to tune classification; changing it and re-running one part should be enough to fix a department.
