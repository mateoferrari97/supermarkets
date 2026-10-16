# 06: Turn Fits into Candidates with the size and quantity rule

**What to build:** Pure code in `src/core/product-selection/` that takes an Item and its Fits and returns up to 10 Candidates (product and quantity to buy) ranked by snapshot price per unit of measure, with the code Notes it produced; and the Selection Policy over simulated Candidates. Not yet called by the chat. See the spec, "From Fits to Candidates".

**Blocked by:** 02, 04

**Status:** resolved

## Decisions (agreed with the Owner)

- Every rule of the spec's "From Fits to Candidates": `common` as the mode among packaged Fits with its tie rule; `biggest` and `smallest` over packaged Fits of the majority dimension; `exact` with the nearest size; `minimum`, `units` and `weight` quantities; Sale Step rounding to the nearest multiple, at least one step; at most 10 Candidates, cheapest per unit of measure.
- Notes are fixed Spanish templates in code; none for a default. Templates: "No hay de 2,25 l; llevo 2 l", "La picaña se vende de a 1,25 kg: llevo 2,5 kg", "Carrefour vende por kg: llevo 1,5 kg", and one for a size ignored because no Fit is packaged.
- Selection Policy: savings first, then lowest price per unit of measure (total ÷ (quantity × size), or ÷ kg), then lowest `itemId` (ADR 0011).

## Constraints

- No I/O: snapshot prices in, Candidates out. Simulation is ticket 08.

## Acceptance

- [x] Table tests for each rule above with its Note, including: coca "grande" picks 2,25 l among 354 ml to 2,25 l; "chica" picks the smallest; "2.25 l" missing gives 2 l with a Note; "300 g" of jamón compares a 200 g pack ×2 against 0.3 kg sold by weight by total price; "3 manzanas" with only Fits sold by weight gives 1.5 kg at a 0.5 kg Sale Step with a Note; "picaña 2 kg" at a 1.25 kg Sale Step gives 2.5 kg with a Note; a mode tie broken by price per unit; more than 10 options cut to the 10 cheapest per unit.
- [x] Selection Policy tests: savings over price, price per unit across sizes, `itemId` tie.
- [x] `pnpm check` exits 0.

## Comments

- Built on 2026-10-15. `candidatesFor(item, fits)` in `src/core/product-selection/candidates.ts` returns up to 10 Candidates `{ product, quantity, measured, notes }`: `quantity` is what goes to Carrefour (packages, or Sale Steps of a product sold by weight), `measured` the amount the price per unit divides by (ml, g, units, or the weight asked for a `weight` quantity, so those options compete by total price), `notes` the code Notes of that Candidate in flow order (size, Sale Step rounding, units of a product sold by weight). `snapshotTotal` gives its Catalog Snapshot total. `rankBySelectionPolicy` in `selection-policy.ts` ranks simulated Candidates `{ candidate, total, savings }`: savings first, then simulated total ÷ `measured`, then lowest `itemId`; ticket 08 takes the first and falls back down the list.
- Tests: `candidates.test.ts` (21 table rows plus the 10-limit, missing price and no-Fit cases, and `snapshotTotal`), `selection-policy.test.ts` (savings over price, price per unit across sizes, savings ties by price per unit, `itemId` tie). `pnpm check` exits 0 (18 files, 262 tests).
- Choices the spec left open, for the Owner to confirm:
  - Rounding Note template is "Picaña se vende de a 1,25 kg: llevo 2,5 kg" (the Item's `product`, capitalized, no article), since code cannot know the article.
  - Size ignored when no Fit has a size (`biggest`/`smallest`): "Carrefour no lo vende por tamaño: no pude elegir el más grande" / "… el más chico". An `exact` size with no Fit of its dimension is ignored with "No hay de 2,25 l".
  - Under `common`, Fits sold by weight and packaged Fits without size stay beside the mode size.
  - A `weight` quantity keeps only Fits sold by weight and packaged Fits whose size is a weight; with none of them the Item gets no Candidates.
  - A Fit with no snapshot price ranks after every priced Fit; a tie on the majority dimension of `biggest`/`smallest` goes to the dimension of the first Fit.
