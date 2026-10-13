# Manual test: can an LLM build a Carrefour cart link?

Paste everything below the line into a fresh Claude Code session.

---

You are building a shopping cart on carrefour.com.ar for me. You never log in and never buy anything. Your only output is a link that I open in my own browser, where I am already logged in, and pay myself.

Finding promotions is the top priority. I want to see every promotion that touches my list, use the ones that fit, and only then fall back to picking one plain product per item.

## Step 1: search the catalog

For each item in my shopping list, run this command with the item's `query` (URL-encoded) in place of `QUERY`. It calls the public VTEX catalog and prints a compact list of up to 20 candidates:

```sh
curl -s -A "Mozilla/5.0" "https://www.carrefour.com.ar/api/catalog_system/pub/products/search?ft=QUERY&_from=0&_to=19" | python3 -c '
import json,sys
out=[]
for p in json.load(sys.stdin):
  for it in p["items"]:
    s=next((x for x in it["sellers"] if x["sellerId"]=="1"),it["sellers"][0]); o=s["commertialOffer"]
    promos=[{"name":t["Name"],"minQty":t.get("Conditions",{}).get("MinimumQuantity"),"effects":{x["Name"]:x["Value"] for x in t.get("Effects",{}).get("Parameters",[])}} for t in o.get("PromotionTeasers") or [] if not any(x["Name"]=="RestrictionsBins" for x in t.get("Conditions",{}).get("Parameters",[]))]
    out.append({"itemId":it["itemId"],"name":p["productName"],"brand":p.get("brand"),"price":o["Price"],"listPrice":o["ListPrice"],"available":o["AvailableQuantity"],"unit":it.get("measurementUnit"),"unitMultiplier":it.get("unitMultiplier"),"promotions":promos})
print(json.dumps(out,ensure_ascii=False))'
```

Use only the `query` I wrote. Do not rewrite it or run extra searches; this test measures how good the site's own search is.

One exception: when an item has `brands`, also run the same command once per brand, with `<query> <brand>` in place of `QUERY` (for example `yerba Amanda`). Merge those results with the plain search and drop duplicate `itemId`s. A candidate belongs to a brand when its `brand` field or its `name` contains the brand, ignoring case and accents.

The command leaves out promotions tied to a specific bank card (for example "Tarjeta Carrefour 15%"), because they apply to almost every product and only with that card.

## Step 2: find the promotions

A candidate has a promotion when either:

- `price` is lower than `listPrice` (a direct discount), or
- `promotions` is not empty. `minQty` is how many units you must buy for it to apply. The name often carries the rule, for example "2do al 50%" means the second unit is half price, and a date range such as "9 al 15.10" means it runs from 9 to 15 October.

## Step 3: pick one candidate per item

- Skip candidates with `available` 0.
- Narrow the candidates by brand first:
  - No `brands`: every candidate that matches what I asked for stays in.
  - `brands` with `brandsOnly` false or missing: keep only candidates of those brands. If none of them is available, fall back to every candidate, as if there were no `brands`, and say so.
  - `brands` with `brandsOnly` true: keep only candidates of those brands. If none of them is available, the item is not found; never pick another brand.
  - The order of `brands` does not rank them; all listed brands are equally good.
- Among the remaining candidates, prefer one with a promotion, then one with a direct discount, then the cheapest per unit of measure (per kg, per litre, per unit), reading the size from the product name ("1 l.", "800 g.", "x kg.").
- If the chosen promotion needs more units than I asked for (for example "2do al 50%" when I asked for 1), raise the quantity to the promotion's minimum and add it to the cart. Never go above that minimum.
- If no candidate matches what I asked for, do not guess: leave the item out and list it as not found.

## Step 4: work out the quantity

- `unit` "un": `qty` is the number of packages I asked for.
- `unit` "kg": `qty = kg / unitMultiplier`, rounded up. Example: banana has `unitMultiplier` 0.5, so 1 kg is `qty=2`.

## Step 5: build the link

One link for the whole cart. Repeat `sku`, `qty` and `seller` for each item, and add `sc=1` once at the end:

```
https://www.carrefour.com.ar/checkout/cart/add?sku=<itemId>&qty=<qty>&seller=1&sku=<itemId>&qty=<qty>&seller=1&sc=1
```

## Step 6: answer me, in Spanish

1. Promotions found: every promotion among the candidates of my items, with product, rule, minimum quantity and whether it is in the cart. When a brand filter kept a promotion out of the cart, say so.
2. Quantities you raised to reach a promotion: item, what I asked for, what you put in the cart, the extra cost and the saving.
3. The cart link.
4. For each item: what you picked, qty, price, and one line on why. For items with `brands`, say whether the pick is one of my brands or a fallback.
5. Items not found, and what the search returned instead. For a `brandsOnly` item, list the other brands that were available.
6. Estimated total, and how much the promotions save.

## My preferences

Set per item in the shopping list, with two optional fields:

- `brands`: the brands I want for that item, for example `["Colgate", "Kolynos"]`.
- `brandsOnly`: `true` means only those brands; if none is available, leave the item out. `false` or missing means those brands are preferred, but any other brand is fine when none of them is available.

Items without `brands` take any brand: promotions first, otherwise the cheapest per unit of measure.

## My shopping list

```json
[
  { "query": "papel higiénico", "qty": 1, "brands": ["Higienol"] },
  { "query": "rollo de cocina", "qty": 1 },
  { "query": "cepillo de dientes", "qty": 1, "brands": ["Oral-B"], "brandsOnly": true },
  { "query": "pasta de dientes", "qty": 1, "brands": ["Colgate"], "brandsOnly": true },
  { "query": "jabón de tocador", "qty": 1, "brands": ["Dove", "Rexona"] },
  { "query": "shampoo", "qty": 1, "brands": ["Pantene"], "brandsOnly": true },
  { "query": "detergente", "qty": 1, "brands": ["Magistral"] },
  { "query": "yerba", "qty": 1, "brands": ["Playadito", "Amanda"], "brandsOnly": true },
  { "query": "fritolin", "qty": 1 },
  { "query": "miel", "qty": 1 },
  { "query": "banana", "kg": 1 },
  { "query": "frutilla", "qty": 1 },
  { "query": "huevos", "qty": 1 },
  { "query": "boniato", "kg": 1 },
  { "query": "limón", "kg": 1 },
  { "query": "repollo", "kg": 1 },
  { "query": "tomate cherry", "kg": 1 },
  { "query": "arándanos", "qty": 1 },
  { "query": "frutos secos", "qty": 1 },
  { "query": "arroz", "qty": 1 },
  { "query": "pan", "qty": 1 }
]
```
