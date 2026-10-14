# 02: Translate the Owner's preference into a Selection Policy

**What to build:** The Owner writes a preference for the whole order ("lo más barato por litro", "solo La Serenísima", "prefiero Sancor o Ilolay", "nada de Marolio") and products are picked by it; whatever no rule can express is reported back and the rest goes ahead. See `.scratch/product-selection/spec.md` (Selection Policy).

**Blocked by:** 01

**Status:** resolved

- [x] `split-order` also returns the order's preference text (nullable).
- [x] A new LLM task, with its prompt file, translates it into a zod-validated Selection Policy: ranking `savings-first` (default) or `cheapest-per-unit`, brands only, brands preferred, brands excluded, and the parts it could not express.
- [x] `cheapest-per-unit` sorts search by `price:asc` and picks by price per unit, ignoring savings.
- [x] Brands only restrict the search; brands preferred are tried first and fall back to any brand; excluded brands never become Candidates.
- [x] A brand on the Item wins over the order's brand rules for that Item.
- [x] Unexpressed preferences appear in the Product Selection and in the command's output.
- [x] Tested through `pickProducts` with fake ports; the task is covered by the Claude Code adapter tests.
- [x] `pnpm check` exits 0.

## Comments

`split-order` returns `preference` (nullable) and `OrderResolution` carries it through the questions round. `translatePreference` is a new task of the `Llm` port with `prompts/order-resolution/translate-preference.md`; its output is `selectionPolicySchema` in `src/order-resolution/llm.ts` (`ranking`, `brandsOnly`, `brandsPreferred`, `brandsExcluded`, `unexpressed`). With no preference, `DEFAULT_SELECTION_POLICY` is used and no session runs.

`CandidateQuery.brand` became `brands`: several brand slugs in one path (`brand/coca-cola/brand/pepsi`) are an OR in Intelligent Search v1 (live on 2026-10-14: 13 Coca Cola + 7 Pepsi = 20). Brands preferred are searched first and, with no available Candidate, the Item is searched with any brand and a notice says so. Excluded brands are filtered in code with `productMatchesBrand` and make the search ask for 50 results.

Real run on 2026-10-14, postal code 1425: "una gaseosa y un kilo de tomate, lo más barato por litro, prefiero Pepsi, que sea orgánico, pago con Visa Galicia, envío a 1425" picked Pepsi 500 cc at $1,900 ("Es el más barato por litro"). Found there:
- `split-order` read "que sea orgánico" as a term of the tomato, not as a preference, so it never reached `unexpressed` and the tomato was not filled.
- `price:asc` sorts by package price, so the two Candidates were small bottles; a 2,25 l bottle cheaper per litre was not among them. This is the trade-off accepted in ADR 0005.
