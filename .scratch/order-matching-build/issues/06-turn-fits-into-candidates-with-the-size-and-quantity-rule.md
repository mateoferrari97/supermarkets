# 06: Turn Fits into Candidates with the size and quantity rule

**What to build:** Pure code in `src/core/product-selection/` that takes an Item and its Fits and returns up to 10 Candidates (product and quantity to buy) ranked by snapshot price per unit of measure, with the code Notes it produced; and the Selection Policy over simulated Candidates. Not yet called by the chat. See the spec, "From Fits to Candidates".

**Blocked by:** 02, 04

**Status:** ready-for-agent

## Decisions (agreed with the Owner)

- Every rule of the spec's "From Fits to Candidates": `common` as the mode among packaged Fits with its tie rule; `biggest` and `smallest` over packaged Fits of the majority dimension; `exact` with the nearest size; `minimum`, `units` and `weight` quantities; Sale Step rounding to the nearest multiple, at least one step; at most 10 Candidates, cheapest per unit of measure.
- Notes are fixed Spanish templates in code; none for a default. Templates: "No hay de 2,25 l; llevo 2 l", "La picaña se vende de a 1,25 kg: llevo 2,5 kg", "Carrefour vende por kg: llevo 1,5 kg", and one for a size ignored because no Fit is packaged.
- Selection Policy: savings first, then lowest price per unit of measure (total ÷ (quantity × size), or ÷ kg), then lowest `itemId` (ADR 0011).

## Constraints

- No I/O: snapshot prices in, Candidates out. Simulation is ticket 08.

## Acceptance

- [ ] Table tests for each rule above with its Note, including: coca "grande" picks 2,25 l among 354 ml to 2,25 l; "chica" picks the smallest; "2.25 l" missing gives 2 l with a Note; "300 g" of jamón compares a 200 g pack ×2 against 0.3 kg sold by weight by total price; "3 manzanas" with only Fits sold by weight gives 1.5 kg at a 0.5 kg Sale Step with a Note; "picaña 2 kg" at a 1.25 kg Sale Step gives 2.5 kg with a Note; a mode tie broken by price per unit; more than 10 options cut to the 10 cheapest per unit.
- [ ] Selection Policy tests: savings over price, price per unit across sizes, `itemId` tie.
- [ ] `pnpm check` exits 0.

## Comments
