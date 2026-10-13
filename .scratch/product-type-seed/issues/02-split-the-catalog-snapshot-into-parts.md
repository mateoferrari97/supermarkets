# 02: Split the Catalog Snapshot into parts by department

**What to build:** A command that reads the local Catalog Snapshot and writes the grocery Tipos as about 12 parts under the git-ignored data folder, ready for classifier subagents. See `.scratch/product-type-seed/spec.md` (Scope, Splitter module).

**Blocked by:** 01 (test runner)

**Status:** ready-for-agent

- [ ] Only the 10 grocery departments are included; products without a Tipo are ignored.
- [ ] Each Tipo appears in exactly one part, in the grocery department where it has most products (ties broken by department name).
- [ ] Departments over about 220 Tipos are split into numbered sub-parts, ordered by Sección then Tipo name.
- [ ] Each Tipo carries: name, products, available products, top Familias with counts, measure units, up to 5 example product names.
- [ ] A missing local Catalog Snapshot fails with a message pointing to `pnpm carrefour:catalog`.
- [ ] Tests on a small hand-made catalog cover the rules above.
- [ ] Running it on the 2026-10-13 snapshot covers all 2,203 grocery Tipos.
- [ ] `pnpm check` exits 0.
