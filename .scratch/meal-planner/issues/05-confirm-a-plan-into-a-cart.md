# 05: Confirm a Plan into a cart that shows the Idea

**What to build:** The Owner confirms the Plan shown, in their own words or with a "Confirmar" chip that sends "Confirmo", and gets today's cart. The `plan` task gains the output `{ kind: "confirm" }`, valid only when a Plan was shown. Each Plan Line becomes an Item with `original` "<product name> — <purpose>" and one Candidate, `candidateOf(item, product)` at the line's quantity, passed to the cart as an `ItemToChoose` with that one Candidate: no search, no `fit-products`, no Selection Policy choice. Simulation, Notes, not got, the link and Corrections run unchanged. The Order keeps the Plan's title and Idea, and the chat shows the Idea above the cart table.

**Blocked by:** 04

**Status:** resolved

- [x] `checkedPlan` rejects `confirm` when no Plan was shown, with a test
- [x] Order tests: a confirmed Plan gives one Item per line with one Candidate each and keeps the Idea; `takeCart` returns it in the Cart shown
- [x] `takeTurn` test: confirm, simulate, cart with the Idea; an unavailable product is not got with its Note
- [x] A Correction after a Plan's cart works as after an order
- [x] The Cart event carries the Idea; the chat shows the "Confirmar" chip and the Idea above the cart table
- [x] The prompt shows a confirmation in the recipe example
- [x] Checked by hand in `pnpm dev`: lasaña Plan confirmed into a cart; screenshot in Comments
- [x] `ARCHITECTURE.md` covers the Plan to Order step
- [x] `pnpm check` is green

## Comments

- Output: `PlanOutput` and `CheckedPlanOutput` gain `{ kind: "confirm" }` (`src/core/planning/plan.ts`). `checkPlan` throws `plan answer breaks a rule: a confirm with no Plan shown` when the input has no last Plan. `planWithSearches` returns a `confirm` like an answer. The adapter schema's `kind` gains `"confirm"` and `readPlan` maps it to `{ kind: "confirm" }`.
- Plan to Order: `orderFromPlan(postalCode, plan, products)` in `src/core/order-conversation/order.ts`. Each line becomes a `ready` Item from `itemOfPlanLine` (`original` "<product name> — <purpose>", packaged as units, by weight as grams), whose `ItemToChoose` holds only `candidateOf(item, product)`; `checkPlan` builds its shown lines from the same `itemOfPlanLine`. `Order` and `Cart` gain `idea: PlanIdea | null` (`{ title, sections }`), null for an order; `takeCart` copies it into the Cart and into stage `cart`, so a Correction keeps it.
- `takeTurn`: in stage `planning` a `confirm` runs `nextTurn` on the Order from the last Plan shown and the products seen, so simulation, Notes, not got, the link and Corrections run unchanged. A Plan line has one Candidate, so its cart reason is "Es el único disponible entre los candidatos." unless a promotion applies, and an unavailable product is not got with "no hay ninguno disponible en tu sucursal".
- Chat: the Plan message has a "Confirmar" chip, shown while it is the last message, that sends "Confirmo" at once. The cart shows the title and the Idea's sections (`IdeaView`, shared with the Plan) above "Listo, este es tu carrito en Carrefour:".
- Prompt: a Goal step and a Guardrail for `confirm`, and the recipe example ends with "Confirmo" answered by `{ "kind": "confirm", ... }`.
- Hand check in `pnpm dev` on port 3500, postal code 1425. The browser again typed only "ña para 4" into the input on the first message (as in ticket 04), and the planner asked whether it was lasaña; "sí, quiero hacer lasaña para 4" ran two search rounds and showed a Plan of 7 lines, total $ 32.385,90, with the "Confirmar" chip. Tapping it sent "Confirmo": "Armando el plan" (the `confirm`), "Carrefour: simulando el carrito", and the cart of 7 lines, total $ 33.458,80, with "Lasaña de carne para 4", the ingredients and the steps above the table and each line's `original` naming its purpose. The Conversation Log had `route-message` and four `plan` calls. Screenshots: [05-lasagna-plan-with-confirm-chip.png](../screenshots/05-lasagna-plan-with-confirm-chip.png), [05-lasagna-cart-with-idea.png](../screenshots/05-lasagna-cart-with-idea.png). As in ticket 04, `.data` is a symlink to the main checkout's data folder, so the Conversation Logs were written there.
- The cart table shows a by-weight line's quantity in Sale Steps, as for orders (the 600 g of picada shows as 1), not in grams as the Plan does; left as it is, since the cart runs unchanged.
