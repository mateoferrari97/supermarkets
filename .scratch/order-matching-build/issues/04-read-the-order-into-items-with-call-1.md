# 04: Read the order into Items with call 1

**What to build:** The `parse-order` task: `Llm.parseOrder(orderText, signal)` returns Items `{ original, product, brand, size, quantity }` with `size` and `quantity` parsed by code, plus `ignoredPreference`. Its prompt `prompts/order-matching/parse-order.md`, its output schema in `adapters/claude-code`, and models per task in the Claude Code adapter. Not yet called by the chat. See the spec, "Item and its parsing" and "LLM tasks".

**Blocked by:** None (can start immediately)

**Status:** resolved

## Decisions (agreed with the Owner)

- Prompt and schema: the drafts of `.scratch/order-matching/design.md` ("Call 1 prompt", "Call 1 schema"), plus `ignoredPreference` and a guardrail that a card or a preference is never an Item.
- `claude-sonnet-5-5` with `--effort low` for this task; the other existing tasks keep `claude-haiku-5-5` until they are deleted. The adapter takes a model and effort per task; `LlmCall` records the effort.
- `size` strings: `common`, `biggest`, `smallest`, or `<amount> <ml|l|g|kg>`; `quantity` strings: `minimum`, `<n> unit`, `<amount> <g|kg>`. Code parses them into the spec's `size` and `quantity` types; a string that does not parse fails the call.

## Constraints

- The `Llm` fakes in existing tests implement the new method; no other behaviour changes.

## Acceptance

- [x] Adapter tests with a fake `ProcessRunner`: model and effort arguments, prompt file, input `<order>` wrapping, a valid output parsed into Items, an unparseable `size` or `quantity` rejected.
- [x] Parser tests for every string form, including decimals ("2.25 l", "1.5 kg") and amounts normalized to ml and g.
- [x] One real run of the Conversation Log order and of the prototype's unseen order: time per call (target 6 s on average, 7 s at worst for about 10 Items) and the Items, noted under Comments.
- [x] `docs/LLM.md` describes the task, its model and effort.
- [x] `pnpm check` exits 0.

## Comments

Built on 2026-10-15 from commit 626819e.

- `Llm.parseOrder` in `src/core/order-resolution/llm.ts`; Item, `Size`, `Quantity`, `parseSize` and `parseQuantity` in `src/core/order-matching/item.ts`. An exact size reuses `Measure` of `product-selection/concepts.ts` (`dimension` is `volume` or `weight`, amount in ml or g).
- The adapter fixes `TASK_MODELS` per task (`parse-order` on `claude-sonnet-5-5` with `--effort low`, the old tasks on `claude-haiku-5-5` with no effort flag) and takes a `models` override per task; the single `model` option is gone. `LlmCall` and the Conversation Log's `LlmCallRecord` carry `effort`. The prompt path is per task, so `PROMPTS_DIR` is now `prompts/`.
- Output schema `parseOrderOutputSchema`: the draft of `design.md` plus `ignoredPreference`; the quantity regex takes only a whole count of units. `lines` keeps the draft's `.min(1)`, so an order with nothing to buy ("pago con Visa" alone) fails the call; ticket 08 may want to revisit that.
- Prompt `prompts/order-matching/parse-order.md`: the compact draft measured in the map's ticket 14, plus `ignoredPreference`, the guardrails that a card or a preference and a postal code are never lines, and "the count of units is a whole number".

Real runs, 3 per order, `claude-sonnet-5-5 --effort low` through `createLlm` of `compose.ts`. Wall time includes starting the `claude` process; session time is the session's `duration_ms`.

| Order | Items | Wall s (runs) | Wall s mean / worst | Session s (runs) | Cost US$ per call |
|---|---|---|---|---|---|
| Conversation Log (2026-10-15-110545) | 10 | 5.97, 5.39, 5.14 | 5.50 / 5.97 | 4.82, 3.99, 3.78 | 0.0064 (0.0200 on the first, cache write) |
| Prototype's unseen order | 10 | 4.98, 5.96, 5.10 | 5.35 / 5.96 | 3.51, 4.54, 3.73 | 0.0059 (0.0088 on the first) |

Both under the target of 6 s on average and 7 s at worst. The 3 runs of each order returned the same Items.

Conversation Log order, `ignoredPreference` false:

| original | product | brand | size | quantity |
|---|---|---|---|---|
| Queso porsalud light | Queso Port Salut light | - | common | minimum |
| coca cola zero grande | Gaseosa cola zero | Coca Cola | biggest | minimum |
| coca cola normal chica | Gaseosa cola sabor original | Coca Cola | smallest | minimum |
| picana 2kg | Picaña | - | common | weight 2000 g |
| tira de asado 1kg | Tira de asado | - | common | weight 1000 g |
| provoleta santa julia 2 unidades | Queso provoleta | Santa Julia | common | 2 units |
| 1 bolsa de carbon | Carbón para asado | - | common | 1 unit |
| 1 y 1 chorizo morzilla la divisa | Chorizo parrillero | La Divisa | common | 1 unit |
| 1 y 1 chorizo morzilla la divisa | Morcilla | La Divisa | common | 1 unit |
| sal gruesa | Sal gruesa | - | common | minimum |

Prototype's unseen order, `ignoredPreference` false:

| original | product | brand | size | quantity |
|---|---|---|---|---|
| leche descremada la serenisima 2 | Leche descremada | La Serenísima | common | 2 units |
| yerba playadito 1kg | Yerba mate | Playadito | exact 1000 g | minimum |
| fideos tirabuzon | Fideos tirabuzón | - | common | minimum |
| aceite girasol grande | Aceite de girasol | - | biggest | minimum |
| papel higienico | Papel higiénico | - | common | minimum |
| 3 manzanas | Manzana | - | common | 3 units |
| jamon cocido 300g | Jamón cocido | - | common | weight 300 g |
| pan lactal | Pan lactal | - | common | minimum |
| birra quilmes chica | Cerveza | Quilmes | smallest | minimum |
| mayo hellmans | Mayonesa | Hellmans | common | minimum |

Two extra single runs: "2 leches la serenisima, pan lactal, nada de Marolio, pago con Visa" gave 2 Items (Leche La Serenísima 2 units, Pan lactal) with `ignoredPreference` true, 1.7 s session; "un cindor, nada de huevos, envio a 1425" gave 1 Item (Bebida láctea chocolatada, Cindor, 1 unit) with `ignoredPreference` false, 2.0 s session.

`pnpm check` exits 0.
