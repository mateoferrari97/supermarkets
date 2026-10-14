# Supermarkets

## Online Store

**Online Store**:
A retailer with a public catalog and an online cart, such as Carrefour. The Assistant never talks to it; it fills a cart that the Owner opens and pays. It is not a Shop.
_Avoid_: Shop, supermarket, retailer

**Branch**:
The Online Store location whose prices, stock and promotions a cart is built against. It follows from the postal code the Owner gives before the order; Carrefour resolves it from the postal code, and a postal code no Branch serves is refused before the order is read.
_Avoid_: Region, seller, store, sucursal

**Catalog Snapshot**:
The state of an Online Store's catalog at one moment, downloaded to the local machine: products, prices, stock and promotions. It is used to understand an order (evidence, terms, sizes), not to pick products, which are picked from live search and checkout simulation (ADR 0005).
_Avoid_: Cache, crawl, scrape

**Product Type**:
A kind of product in the Assistant's own vocabulary, such as "frutilla fresca" or "papel higiénico", independent of any Online Store. Products of one Product Type are interchangeable when choosing what to buy.
_Avoid_: Category, tipo de producto, subfamily, product kind

**Product Type Group**:
A named set of Product Types that one loose word can refer to, such as "leche" over "leche entera" and "leche descremada". It is never bought as such: the Owner picks one of its Product Types or leaves the choice to the Selection Policy.
_Avoid_: Category, parent type, family, department

**Selection Policy**:
The ordered rules that choose one product per Item from an Online Store, such as "only these brands, then promotions first". The Owner states a preference in their own words; the Selection Policy is that preference in a fixed form, so the same Items with the same search and simulation answers always get the same products.
_Avoid_: Strategy, criteria, mode, preference profile

**Candidate**:
A product of an Item's Product Types that live search returns for the Owner's region, available, and that is simulated at the quantity bought before one is picked. Each Item has at most two.
_Avoid_: Option, hit, result

**Payment Card**:
The card the Owner says they will pay with, such as "Tarjeta Carrefour Mastercard". It is passed to the checkout simulation so that card promotions count when picking products; the Owner names it, never its number.
_Avoid_: Payment method, BIN, tarjeta
