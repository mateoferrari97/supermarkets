---
Status: accepted
---

# Own Product Types, mapped from each Online Store's classification

Choosing the cheapest product, replacing one that is out of stock and spotting a useful promotion all need to know which products are interchangeable. Carrefour's own search is too loose for that ("pan" returns crisps and a speaker), so we keep a Catalog Snapshot of the Online Store and give every product a Product Type: our own coarse vocabulary ("Pan de molde", "Papel higiénico"), the same for every Owner and every Online Store. For Carrefour the only key is the product's `Tipo de producto` field: a table maps each Tipo to a Product Type, so all products of that Tipo inherit it. The table is seeded once for the grocery Secciones of Carrefour's hierarchy and then grows when an order needs a Tipo nobody has mapped; the LLM proposes new rows, and a Tipo that first appears in a daily pass is only matched against existing Product Types. Products without a Tipo are ignored. Another Online Store gets its own mapping from whatever classification it has, and products with the same EAN in two stores share a Product Type.

## Considered Options

- **Carrefour's `Tipo de producto` as the vocabulary itself.** Free and complete, but 5,486 values with near-duplicates ("Pan de molde", "Pan molde", "Pan lactal") and tied to one store.
- **Subfamilia, or Tipo + Subfamilia, as the key.** Over 37,673 grocery products Tipo covers 99.1% against 97.2% and misfiles less: Familias such as "OTRAS MARCAS" and "MARCA PROPIA" hold eggs, "Huevos color" sit in Subfamilia BLANCO, and chocolate eggs sit in a Subfamilia called HUEVOS. Tipo + Subfamilia has 2.4 times the rows for 1.3 points fewer products with a mismatched unit (4.1% against 5.4%). Data in `.scratch/carrefour-cart/research/catalog-mirror.md`.
- **The LLM classifies every product.** About 109,000 calls for Carrefour alone, and it throws away the store's own classification.
- **No classification; the store's search plus an LLM per request.** What the first manual test did: slow, varies between runs, and cannot replace or spot promotions.

## Consequences

- Catch-all Tipos ("Snacks", "Postre", "Comida lista") span many Familias and may need splitting as exceptions.
- Carrefour's hierarchy fields (Sección, Familia, Subfamilia) stay on each product as data, for scope and for filtering variants such as "sin palo"; they are not part of the mapping.
