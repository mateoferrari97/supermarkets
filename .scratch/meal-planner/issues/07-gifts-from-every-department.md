# 07: Gifts from every department

**What to build:** "Un regalo para mi vieja, le gusta cocinar, hasta $30.000" gets gift ideas, each with its reason, from any department ticket 01 approved, with no servings. `CatalogSearch.findMatches` takes a scope: `order` keeps today's excluded departments, `plan` searches every in-stock product of the approved departments. Planning searches with `plan`; orders never see the new departments.

**Blocked by:** 01, 04

**Status:** ready-for-agent

- [ ] The port and the in-memory adapter take the scope; every order caller passes `order`
- [ ] Tests: `order` still leaves out the excluded departments; `plan` returns a product of an approved one and never one without stock
- [ ] `prompts/planning/plan.md` gains the gift example
- [ ] Checked by hand in `pnpm dev` with one gift request confirmed into a cart; screenshot in Comments
- [ ] `ARCHITECTURE.md` describes the two scopes
- [ ] `pnpm check` is green

## Comments
