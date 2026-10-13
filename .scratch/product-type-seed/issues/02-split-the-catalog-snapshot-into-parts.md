# 02: Split the Catalog Snapshot into parts by department

**What to build:** A command that reads the local Catalog Snapshot and writes the grocery Tipos as about 12 parts under the git-ignored data folder, ready for classifier subagents. See `.scratch/product-type-seed/spec.md` (Scope, Splitter module).

**Blocked by:** 01 (test runner)

**Status:** resolved

- [x] Only the 10 grocery departments are included; products without a Tipo are ignored.
- [x] Each Tipo appears in exactly one part, in the grocery department where it has most products (ties broken by department name).
- [x] Departments over about 220 Tipos are split into numbered sub-parts, ordered by Sección then Tipo name.
- [x] Each Tipo carries: name, products, available products, top Familias with counts, measure units, up to 5 example product names.
- [x] A missing local Catalog Snapshot fails with a message pointing to `pnpm carrefour:catalog`.
- [x] Tests on a small hand-made catalog cover the rules above.
- [x] Running it on the 2026-10-13 snapshot covers all 2,203 grocery Tipos.
- [x] `pnpm check` exits 0.

## Comments

Run on the 2026-10-13 snapshot: 2,203 Tipos in 14 parts (Almacén in 3, Desayuno y merienda and Perfumería y farmacia in 2 each), written to `.data/carrefour/seed/parts/` by `pnpm seed:split`.
