# Supermarkets

## Online Store

**Online Store**:
A retailer with a public catalog and an online cart, such as Carrefour. The Assistant never talks to it; it fills a cart that the Owner opens and pays. It is not a Shop.
_Avoid_: Shop, supermarket, retailer

**Branch**:
The Online Store location whose prices, stock and promotions a cart is built against. It follows from the postal code the Owner gives before the order; Carrefour resolves it from the postal code, and a postal code no Branch serves is refused before the order is read.
_Avoid_: Region, seller, store, sucursal

**Catalog Snapshot**:
The state of an Online Store's catalog at one moment, downloaded to the local machine: products, prices, stock and promotions. It is searched for the Matches of each Item; its prices and stock are a first cut, and checkout simulation in the Branch has the last word (ADR 0012).
_Avoid_: Cache, crawl, scrape

**Selection Policy**:
The fixed rule that chooses one product per Item among its Candidates: promotions and discounts first, then the lowest price per unit of measure. The same Items with the same search and simulation answers always get the same products.
_Avoid_: Strategy, criteria, mode, preference profile

**Item**:
One thing the Owner wants to buy, as read from their order: what it is, the brand if they named one, its size and how much. One phrase of the order can hold two Items ("1 y 1 chorizo morcilla").
_Avoid_: Line, order line, product

**Match**:
A product of the Catalog Snapshot found for an Item because its name, brand or Carrefour type resembles what the Owner asked for. It is not yet known to fit.
_Avoid_: Candidate, hit, result

**Fit**:
A Match that has everything the Owner asked for in an Item (the thing, its variant, and the brand they named when the catalog has it), whatever its size and price. The Selection Policy chooses among the Fits.
_Avoid_: Option, eligible product

**Candidate**:
A Fit that is simulated in the Owner's Branch at the quantity bought before one is picked.
_Avoid_: Option, hit, result

**Alternative**:
A Match offered to the Owner when no Match fits an Item, among the ones most like what they asked for. The Owner may pick one by its number.
_Avoid_: Option, suggestion

**Correction**:
A change the Owner asks for on an Item already resolved: another product, brand, size or quantity, or dropping it. It comes after the cart or together with an answer to a question, and the corrected Item is read again as a new Item.
_Avoid_: Edit, amendment, change request

**Sale Step**:
The smallest amount of a product sold by weight that an Online Store sells, such as 0.5 kg of banana or 1.25 kg of picanha; every amount bought is a multiple of it, and a weight the Owner asks for is rounded up to the next multiple, so 2.7 kg at a 0.8 kg Sale Step buys 3.2 kg. A packaged product has no Sale Step: it is bought by the unit.
_Avoid_: Unit multiplier, increment, minimum quantity

**Note**:
A sentence to the Owner, shown with the cart, about something the Assistant did that the Owner did not ask for: a product, size or quantity read or changed, an Item it could not get or removed, or something it ignored. A default the Owner left open is not a Note.
_Avoid_: Notice, warning, message

## Conversation

**Topic**:
The label the first message of a conversation gets: `order` when it names what to buy, `plan` when it states an intent that becomes a Plan, or `off-topic` when it is not about shopping.
_Avoid_: Intent, category, route

**Plan**:
A proposal of products with quantities and the Idea behind them, built by the LLM from products a code search returned. The Owner revises and confirms it before it becomes a cart; until then nothing is bought (ADR 0013).
_Avoid_: Shopping list, recipe list, suggestion

**Plan Line**:
One product of a Plan with its quantity and its purpose ("para la lasaña", "regalo para mamá"). Once the Plan is confirmed it becomes an Item whose only Candidate is that product, as if the Owner had chosen it.
_Avoid_: Ingredient, suggestion, line item

**Idea**:
What a Plan is for: a recipe with its steps, a menu per day, gift ideas with their reasons, or advice. It is shown with the Plan and with the cart it becomes.
_Avoid_: Recipe list, suggestion, description

**Order**:
The Items of one conversation and where each stands (read, asked, in the cart), from the first message to the last cart. It counts the questions spent on each Item and keeps the Notes about Items dropped or removed until the cart is shown.
_Avoid_: Basket, shopping list, conversation state

**Conversation Log**:
The record of one conversation between the Owner and the Assistant, from the postal code to the last cart or to its abandonment, including what the LLM and the Online Store were asked and answered along the way. It exists to review mistakes after the fact; it is never shown to the Owner in the chat.
_Avoid_: Transcript, chat history, order log
