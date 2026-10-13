---
Status: accepted
---

# Each order starts from free text, asks when in doubt, and remembers nothing

The Owner writes an order as free text, without separators ("necesito leche, dos cocas grandes y nada de huevos"). Claude Haiku 5.5 splits it into Items, each with the phrase, a quantity ("medio", "un par", "2,25 l"), terms that narrow the product, vague words it does not interpret, and a brand if one was named; things the Owner rules out ("nada de huevos") are not Items. Items are then resolved as in ADR 0003. Every doubt left in the order (an ambiguous Item, a Group, a vague word, a term with no match, nothing found) goes to the Owner in one message, with options built by code from the Catalog Snapshot. The Owner answers in free text; Haiku maps the answer onto the options offered, and anything that still does not match one is asked again. "Cualquiera" lets the Selection Policy choose among the options offered. A brand named in the order applies to that order only.

Nothing is kept between orders in the first version: no per-Owner memory or defaults, no stored preferences, no order history and no stored carts. The same vague word is asked about in every order; an Owner who writes "leche entera" instead of "leche" is not asked.

## Considered Options

- **Remember answers and preferences per Owner.** Fewer questions after a few orders, but it needs storage, a way to forget or change a default, and rules for when a stored preference applies. Left out to keep the first version small.
- **Let the LLM settle vague words ("grande" means 2,25 l).** No questions, but a wrong guess goes into the cart without anyone noticing.
- **Repeat a past order ("lo de la semana pasada").** Needs an order history; out with it.
- **Expand a plan into Items ("un asado para 10").** That is creative work, not translation. A separate planner, whose list the Owner confirms before it enters this flow, comes later; until then the Owner is asked to list what they need.
