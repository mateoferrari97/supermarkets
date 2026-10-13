# Supermarkets

## Online Store

**Online Store**:
A retailer with a public catalog and an online cart, such as Carrefour. The Assistant never talks to it; it fills a cart that the Owner opens and pays. It is not a Shop.
_Avoid_: Shop, supermarket, retailer

**Branch**:
The Online Store location whose prices, stock and promotions a cart is built against. It is chosen per Owner, not fixed.
_Avoid_: Region, seller, store, sucursal

**Catalog Snapshot**:
The state of an Online Store's catalog at one moment for one Branch: products, prices, stock and promotions. The same Product Types and Selection Policy against the same Catalog Snapshot always give the same cart.
_Avoid_: Cache, crawl, scrape

**Product Type**:
A kind of product in the Assistant's own vocabulary, such as "frutilla fresca" or "papel higiénico", independent of any Online Store. Products of one Product Type are interchangeable when choosing what to buy.
_Avoid_: Category, tipo de producto, subfamily, product kind

**Product Type Group**:
A named set of Product Types that one loose word can refer to, such as "leche" over "leche entera" and "leche descremada". It is never bought as such: the Owner picks one of its Product Types or leaves the choice to the Selection Policy.
_Avoid_: Category, parent type, family, department

**Selection Policy**:
The ordered rules that choose one product per Item from an Online Store, such as "only these brands, then promotions first". The Owner states a preference in their own words; the Selection Policy is that preference in a fixed form, so the same Items on the same Catalog Snapshot always get the same products.
_Avoid_: Strategy, criteria, mode, preference profile
