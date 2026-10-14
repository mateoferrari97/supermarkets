# 02: Translate the Owner's preference into a Selection Policy

**What to build:** The Owner writes a preference for the whole order ("lo más barato por litro", "solo La Serenísima", "prefiero Sancor o Ilolay", "nada de Marolio") and products are picked by it; whatever no rule can express is reported back and the rest goes ahead. See `.scratch/product-selection/spec.md` (Selection Policy).

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] `split-order` also returns the order's preference text (nullable).
- [ ] A new LLM task, with its prompt file, translates it into a zod-validated Selection Policy: ranking `savings-first` (default) or `cheapest-per-unit`, brands only, brands preferred, brands excluded, and the parts it could not express.
- [ ] `cheapest-per-unit` sorts search by `price:asc` and picks by price per unit, ignoring savings.
- [ ] Brands only restrict the search; brands preferred are tried first and fall back to any brand; excluded brands never become Candidates.
- [ ] A brand on the Item wins over the order's brand rules for that Item.
- [ ] Unexpressed preferences appear in the Product Selection and in the command's output.
- [ ] Tested through `pickProducts` with fake ports; the task is covered by the Claude Code adapter tests.
- [ ] `pnpm check` exits 0.
