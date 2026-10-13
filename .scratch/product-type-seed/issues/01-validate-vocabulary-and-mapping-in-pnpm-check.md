# 01: Validate the Product Type vocabulary and the Carrefour mapping in pnpm check

**What to build:** The repo holds the Product Type vocabulary (Product Type Groups over Product Types, with stable ids and Spanish names) and the Carrefour mapping (Tipo to Product Type id, or `null` for reviewed and excluded), both empty for now, and `pnpm check` fails whenever either is inconsistent. This also adds the repo's first test runner. See `.scratch/product-type-seed/spec.md` (Validator module) and ADR 0003.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] A test runner is added and `pnpm check` runs it.
- [x] Schemas exist for the vocabulary and the Carrefour mapping.
- [x] The vocabulary and mapping files are committed empty and pass validation.
- [x] Validation fails, naming the offending entry, when: a mapping id is not in the vocabulary; an id is duplicated; an id is not a lowercase ASCII hyphenated slug; a Product Type belongs to no Group or to more than one; a Group is empty.
- [x] Tests cover the valid case and each failure above.
- [x] `pnpm check` exits 0.
