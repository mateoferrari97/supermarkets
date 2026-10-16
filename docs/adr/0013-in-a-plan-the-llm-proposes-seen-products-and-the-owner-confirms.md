---
Status: accepted
---

# In a Plan the LLM proposes products it saw, code checks them, and the Owner confirms

The Owner can only order by naming what to buy. When they write an intent instead ("quiero hacer lasaña para 4", "un asado para 10 con unos $50.000", "las comidas de la semana sin TACC", "un regalo para mi vieja, le gusta cocinar"), the order is read as a list: in the Conversation Log of 2026-10-16 the asado became five vague Items, four of them with quantity `minimum`, and the headcount and the budget were lost. Turning an intent into products and amounts is creative work, which ADR 0004 left to a separate planner whose list the Owner confirms first. This is that planner.

The chat now has two kinds of conversation. The first message after the postal code is labelled with a Topic: `order`, `plan` or `off-topic`. An order keeps every rule of ADR 0002, ADR 0004, ADR 0011 and ADR 0012: the LLM translates, code decides, and the LLM never chooses a price, computes a quantity or invents a product. A Plan follows these rules instead:

1. **The planner proposes only products it saw.** It may ask code to search the Catalog Snapshot, a fixed number of rounds per turn, and every product of a Plan Line must be one a search of this conversation returned. It writes the Idea and, for each Plan Line, a product, a quantity and a purpose.
2. **The planner proposes quantities, code checks them.** A quantity must be valid for its product: a whole number of units for a packaged product, grams for one sold by weight, rounded up to its Sale Step by the same rule as Candidates, with the same Note. Code merges lines of the same product and computes the total from Catalog Snapshot prices; the planner never states a price.
3. **Nothing reaches the cart until the Owner confirms.** The Owner sees the Idea, the Plan Lines with their prices and the total, asks for changes in their own words, and confirms. Advice can end with no Plan.
4. **A confirmed Plan Line counts as the Owner's own choice.** Each becomes an Item with one Candidate, its product at its quantity: no search, no `fit-products`, no Selection Policy choice. Checkout simulation in the Branch, the cart, Notes, the cart link and Corrections run as for an order.

Checks 1 and 2 run in core next to the port, as the checks of `fit-products` and `read-reply` do (ADR 0006), so every adapter and every test fake goes through them. A Plan is not repeatable: the same intent can give a different Plan in each run. What makes it safe is that the Owner reads every line and its price before anything is bought.

It amends ADR 0002, as restated by ADR 0011: inside a confirmed Plan, the planner and the Owner chose the products, not the Selection Policy. Orders still have their products picked by code.

It amends ADR 0004: the planner it left out now exists. A plain order still starts from free text and asks when in doubt, and nothing is kept between conversations.

It amends ADR 0012: an order is still matched with two calls around a search. A Plan is built by one planning call that may run several searches, with every department in stock searchable, and enters the cart without the matching flow.

## Considered Options

- **Expand the intent into an order and run it through matching.** The Conversation Log of 2026-10-16 shows the result: vague Items that searches cannot place ("Carne para asado" finds dog snacks and knives first), and the headcount and budget lost.
- **The planner writes product names and code matches them.** It brings back the failure of ADR 0003: names the LLM writes without seeing the catalog do not appear in products.
- **Code computes the quantities from a recipe.** Needs a table of portions per dish and per guest that does not exist; the planner proposes and the Owner corrects.
- **Let the planner search through a tool inside the Claude Code session.** The search loop lives in core instead, so the rounds, the products seen and their checks are in one place and testable with fakes.

## Consequences

- The LLM picks products and amounts in a Plan; a wrong one reaches the cart only if the Owner confirms it.
- A Plan is checked for what code can know (products seen, valid quantities, total against the budget), not for whether the Idea is sensible; the planning eval set measures that apart.
- The new departments are searched only for Plans, and only those whose checkout works in the Branch.
