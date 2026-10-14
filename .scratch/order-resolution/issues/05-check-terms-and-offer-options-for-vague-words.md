# 05: Check terms against the catalog and offer options for vague words

**What to build:** After an Item is resolved, code checks each term ("sin TACC", "sachet", "2,25") against the names of the Product Type's products; a term that matches none becomes a question. A vague word ("grande", "chico") becomes a question whose options code builds from the Catalog Snapshot, such as the distinct sizes in stock for that Product Type and brand; the LLM never chooses the size. See `.scratch/order-resolution/spec.md` (Terms and vague words).

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] A term with no matching product name in the resolved Product Type becomes a question in the order's message.
- [ ] A vague word becomes a question whose options are built by code from the Catalog Snapshot, filtered by brand when one was named; every option exists in stock.
- [ ] Answers to these questions are applied through `answerQuestions`.
- [ ] Tested with a fake LLM and a hand-made catalog through the entry points (for example "dos cocas grandes" offers only the Coca-Cola sizes in the catalog).
- [ ] `pnpm check` exits 0.
