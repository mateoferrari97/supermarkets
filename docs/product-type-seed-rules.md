# Product Type seed rules

Rules for classifying a part of Carrefour's grocery Tipos into Product Type Groups and Product Types. Read `GLOSSARY.md` and ADR 0003 for the terms. A part is a JSON file listing Tipos; each Tipo comes with its product count, available products, top Familias, measure units and up to five example product names. The examples and Familias show what a Tipo really holds; the Tipo name alone can mislead.

## The tree

- Two levels: a **Product Type Group** holds one or more **Product Types**. Every Product Type belongs to exactly one Group.
- A **Product Type** is a set of Tipos that pass the **replacement test**: an Owner who asked for one of them would accept a product of any of the others without being asked. "Pan lactal", "Pan de molde" and "Pan de mesa" pass it together; "Leche entera" and "Leche descremada" fail it, so they are two Product Types. Lean towards merging: keep two Product Types apart only when an Owner ordering one would clearly reject the other in a normal supermarket order (entera or descremada, yerba or té, carne picada or bife, fresh or frozen fruit). Differences of form, preparation, variety or style that an Owner usually accepts stay inside one Product Type ("Jugo listo" and "Jugo concentrado" are one "Jugo"), because the words of an order travel as terms on the product name.
- A **Product Type Group** is the loose word an Owner would write without thinking: "Leche" over "Leche entera", "Leche descremada", "Leche en polvo", "Leche chocolatada". Concepts that cross Tipos are Groups too ("Snack dulce" over Alfajor, Chocolate, Galletitas dulces).
- A Product Type that shares a loose word with nothing else gets a Group of its own with the same name ("Yerba" over "Yerba").
- Size, package, brand, flavour, grape variety and "sin TACC" / "light" stay inside a Product Type: they are handled as terms on the product name at order time. "Vino tinto malbec" and "Vino tinto cabernet" both belong to "Vino tinto". Fat content, form (fluid, powder), colour or style where it changes the drink (rubia, negra) and kind of product split Product Types.
- A **catch-all** Tipo that mixes products nobody would swap ("Snacks": crackers, cones, corn sticks, gum) becomes one broad Product Type; never split a Tipo across Product Types.

## Excluded

Exclude a Tipo when nobody would order it in a supermarket order: clothing, shoe laces, hair accessories, toys, appliances and spare parts sold by marketplace sellers, or a Tipo whose products are something else than its name says (Leche balsámica is a body cream). Household goods a supermarket shopper buys (bin bags, sponges, mops, charcoal, firewood, household insecticides and repellents) stay. Give a short reason in Spanish.

## Doubts

Record a **doubt** whenever the placement is a coin-flip: the Tipo fits two Product Types, its examples mix kinds of product (Leche en polvo entera holds a long-life fluid milk), or exclusion is arguable. List at least two candidates, best first: Product Type ids from your proposal, or `excluded`. When the best home for a doubtful Tipo is a Product Type nothing else fills, propose that Product Type with an empty `tipos` list and name it as a candidate. Write the reason in Spanish, naming the evidence (examples, Familias). A doubt is cheaper than a wrong placement; a placement you are sure of is not a doubt.

## Ids and names

- Names are in Spanish, as an Owner would say them, capitalised like a sentence: "Leche entera".
- Product Type ids are the name in lowercase ASCII, accents removed, words joined by hyphens: `leche-entera`. Group ids are the same with a `grupo-` prefix: `grupo-leche`. Ids are unique.

## Proposal file

Write one JSON object:

- `part`: the part id.
- `groups`: `[{ "id", "name", "productTypes": [{ "id", "name", "tipos": ["<Tipo>", ...] }] }]`
- `excluded`: `[{ "tipo", "reason" }]`
- `doubts`: `[{ "tipo", "candidates": ["<product type id>" | "excluded", ...], "reason" }]`

Every Tipo of the part appears exactly once across `productTypes[].tipos`, `excluded` and `doubts`, spelled exactly as in the part. Every Product Type has at least one Tipo or is named by a doubt; every Group has at least one Product Type.

## Consolidation

The coordinator joins every part's proposal into one tree. Parts are classified apart, so the same idea can come back under two ids or two Groups.

- Merge two Product Types from different parts when they pass the replacement test together ("Leche larga vida entera" in one part and "Leche entera" in another). Keep the id an Owner would guess first.
- Merge two Groups that are the same loose word ("Leche" and "Leches"). When the same Product Type id sits in two Groups that are different loose words, move it to the one an Owner would reach for.
- Place a doubt when another part's Product Types make the answer clear: one candidate is now a real Product Type with Tipos and the other is not, or the examples clearly match one Product Type of the whole tree. Leave it a doubt when it is still a coin-flip; the Owner answers those.
- Do not undo a part's confident placements unless the whole tree shows them wrong (the same Tipo kind mapped two ways in two parts).
