# 05: Check terms against the catalog and offer options for vague words

**What to build:** After an Item is resolved, code checks each term ("sin TACC", "sachet", "2,25") against the names of the Product Type's products; a term that matches none becomes a question. A vague word ("grande", "chico") becomes a question whose options code builds from the Catalog Snapshot, such as the distinct sizes in stock for that Product Type and brand; the LLM never chooses the size. See `.scratch/order-resolution/spec.md` (Terms and vague words).

**Blocked by:** 03

**Status:** resolved

- [x] A term with no matching product name in the resolved Product Type becomes a question in the order's message.
- [x] A vague word becomes a question whose options are built by code from the Catalog Snapshot, filtered by brand when one was named; every option exists in stock.
- [x] Answers to these questions are applied through `answerQuestions`.
- [x] Tested with a fake LLM and a hand-made catalog through the entry points (for example "dos cocas grandes" offers only the Coca-Cola sizes in the catalog).
- [x] `pnpm check` exits 0.

## Comments

Every Item of the Order Resolution now has one shape, `Item & { productTypes, question }`: `question` is `null` once the Item is settled, or one of `productType` (Group or ambiguous, with Product Type options), `phrase` ("¿A qué te referís?"), `term` (one term no product has) or `size` (a vague word, with size options). An Item can hold its Product Types and still ask about a term or a size, so `productType` eval expectations now only check `productTypes`.

Once an Item has its Product Types, from the first resolution or from an answer, code takes the products of those Product Types, filtered by the named brand (normalized brand equality, or the brand inside the product name). The first term no product name contains becomes the question; a term that is a size ("2,25 l", "500 g") matches by quantity and dimension, so "2,25 lts" matches "2,25 l". Terms are checked against all products, sizes only against products in stock (`availableQuantity > 0`, carried as `CatalogProduct.inStock`). If no term is missing and the Item has vague words, the options are the distinct sizes parsed from the names of the in-stock products that also match the Item's terms, smallest first; with no size found the vague words stay on the Item and nothing is asked. Size parsing is in `src/order-resolution/catalog.ts`.

Answers go through `map-answer`, which now receives what each question asks and its term. On a term question `any` drops the term and `rephrased` replaces it; on a size question one chosen option becomes a term and clears the vague words, `any` clears them and leaves the size to the Selection Policy, and more than one size keeps the question. After every answer the Item is checked again.

Real runs on 2026-10-13:
- "dos cocas grandes y yerba sabor chicle": coca asked for size with 220 ml, 354 ml, 600 ml, 1,25 l, 1,75 l, 2,25 l, which are exactly the sizes of the in-stock Coca-Cola gaseosas in the Catalog Snapshot; yerba asked about "sabor chicle". Answer "la coca de 2,25 y la yerba sacale eso": coca x2 with term "2,25 l", yerba with no term. 4 sessions, 10.9 s, US$ 0.0018.
- Full eval set: 10/11 hits, only the expected `conos-de-queso` miss (Snack de maíz this time). 24 sessions, 102.2 s, US$ 0.0067.
