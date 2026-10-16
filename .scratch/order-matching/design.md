# Order matching: the agreed design

Agreed with the Owner in conversation on 2026-10-15, after reviewing the Conversation Log `.data/conversations/2026-10-15-110545-03942ebf-723f-4615-9248-1465b0877cb7.jsonl`. Research behind it: [llm-item-to-product-matching.md](../order-resolution/research/llm-item-to-product-matching.md).

## Why

In that conversation the Assistant failed four Items of one order:

- "1 bolsa de carbon": `split-order` made "bolsa" a term; no product name has it, so it asked "¿lo saco?" in a loop although three carbones were in stock.
- "Queso porsalud light": `split-order` made "porsalud" a brand (it is Port Salut, misspelt); BM25 found no Port Salut and the Owner got 34 cheese Product Types.
- "coca cola zero grande": the Owner was asked a size, with 354 ml among the options.
- "coca cola normal chica": "normal" was lost, so a Zero could be bought.

Root cause: the LLM writes brand and terms without seeing the catalog, and code then needs those exact words in product names.

## The flow

```
Owner's message
  -> call 1 (LLM): order -> Items (original, product, brand, size, quantity)
  -> code: search the Catalog Snapshot per Item (words + trigrams, fused) -> ~30 Matches per Item
  -> call 2 (LLM), one per Item, up to 10 in parallel: Item + Matches -> Fits, a note, or a question when none fits
  -> code: size rule over the Fits, then the Selection Policy, then checkout simulation in the Branch
  -> cart with notes, or the questions
```

## Decisions taken in conversation

- One call 1 per message and one call 2 per Item, up to 10 in parallel ([Measure the levers of call 2 latency](issues/12-measure-the-levers-of-call-2-latency.md)). Code searches between them; the LLM never sees the whole catalog.
- Call 1 output is JSON with a schema (as every task today), not XML or free text. Prompt inputs may be wrapped in XML tags.
- Call 1 runs on `claude-sonnet-5-5` with `--effort low` and writes `size` and `quantity` as short strings (`"2.25 l"`, `"biggest"`, `"2 kg"`, `"minimum"`): about 5.5 s for 10 Items ([Latency of call 1](issues/14-latency-of-call-1.md)).
- Search: BM25 on words (exists in `src/core/order-resolution/bm25.ts`) plus character trigrams, fused by rank (RRF). No embeddings for now. Later in Supabase: `pg_trgm` and full text search with the same fusion, behind a search interface.
- Call 2 keeps every Match that fits; code picks among Fits, so prices stay code.
- Defaults when the Owner does not say:
  - quantity: the smallest amount Carrefour sells (1 unit, or one `unitMultiplier` step for products sold by weight);
  - size: the most common one;
  - variant: the standard one (no zero, light, diet, flavoured or seasoned);
  - no packs unless the Owner says "pack".
- "grande" is the biggest size Carrefour sells among the Fits, "chica" the smallest.
- The Assistant asks only when no Match fits. A brand the Owner named that the catalog lacks does not ask: it picks among other brands and says so.
- Every Item field is filled; a field exists only when code uses it (`variant` and `pack` were dropped: they live in `product` and `original`).

## Call 1 prompt (draft)

```markdown
# Role
You turn an Owner's grocery order, written in Argentine Spanish, into product lines that code can search for in the Carrefour Argentina catalog.

# Context
The order comes inside <order> tags.
The Owner writes fast: typos, missing commas, nicknames ("coca", "porsalud", "morzilla").
Code searches the catalog with `product` and `brand`. Another step then reads the products found and keeps the ones that fit the Owner's words.
You never see the catalog. Code picks sizes and quantities from it.

# Goal
1. Find every thing the Owner wants to buy. Write one line per thing.
2. Split a phrase that names two things: "1 y 1 chorizo morcilla" is two lines.
3. Write `product` as a supermarket product name in Spanish, with the spelling fixed. This step is important.
4. Fill every field of every line. When the Owner did not say something, write the default value given below.

# Guardrails
- Never drop a word that narrows the product: "light", "zero", "normal", "sin TACC", "descremada". Write it in `product`. This step is important.
- Never treat a variety as a brand: "port salut", "cremoso" and "reggianito" are varieties. This step is important.
- Keep a brand the Owner named as written, even if you think it does not exist.
- Words that count packs ("bolsa", "paquete", "caja") count units. They are not part of the product.
- Things the Owner rules out ("nada de huevos") are not lines.
- Never invent a product, a brand, a size or a quantity.

# Output
Return `lines`, one entry per thing, in the order the Owner wrote them.

- `original`: the Owner's words for this thing, copied exactly. Two lines can share them.
- `product`: what to buy, as a supermarket product name in Spanish, with its variant ("light", "zero", "descremada").
  - Use catalog words for the variant when you know them: "coca normal" is "Gaseosa cola sabor original".
  - No brand, size or quantity.
- `brand`: the brand as the Owner wrote it, or null.
- `size`: the size of one product, as a short string.
  - "2.25 l" when the Owner gives a size: "coca 2,25", "yogur de 1 kg". The unit is "ml", "l", "g" or "kg".
  - "biggest" for "grande", "la más grande", "familiar".
  - "smallest" for "chica", "chico", "la más chica".
  - "common" when the Owner gives no size.
- `quantity`: how much to buy, as a short string.
  - "2 unit" for units: "2 unidades", "un par", "1 bolsa", "1 y 1".
  - "2 kg" or "300 g" for a weight of something sold by weight: "picana 2kg", "300 g de jamón".
  - "minimum" when the Owner gives no quantity. Code buys the smallest amount Carrefour sells.
  - The size of a product ("coca 2,25") is never a quantity. It goes in `size`. This step is important.

# Examples
<order>
Queso porsalud light, coca cola zero grande, coca cola normal chica, picana 2kg, provoleta santa julia 2 unidades, 1 bolsa de carbon, 1 y 1 chorizo morzilla la divisa, coca 2,25, sal gruesa
</order>

{
  "lines": [
    { "original": "Queso porsalud light", "product": "Queso Port Salut light", "brand": null, "size": "common", "quantity": "minimum" },
    { "original": "coca cola zero grande", "product": "Gaseosa cola zero", "brand": "Coca Cola", "size": "biggest", "quantity": "minimum" },
    { "original": "coca cola normal chica", "product": "Gaseosa cola sabor original", "brand": "Coca Cola", "size": "smallest", "quantity": "minimum" },
    { "original": "picana 2kg", "product": "Picaña", "brand": null, "size": "common", "quantity": "2 kg" },
    { "original": "provoleta santa julia 2 unidades", "product": "Queso provoleta", "brand": "Santa Julia", "size": "common", "quantity": "2 unit" },
    { "original": "1 bolsa de carbon", "product": "Carbón para asado", "brand": null, "size": "common", "quantity": "1 unit" },
    { "original": "1 y 1 chorizo morzilla la divisa", "product": "Chorizo parrillero", "brand": "La Divisa", "size": "common", "quantity": "1 unit" },
    { "original": "1 y 1 chorizo morzilla la divisa", "product": "Morcilla", "brand": "La Divisa", "size": "common", "quantity": "1 unit" },
    { "original": "coca 2,25", "product": "Gaseosa cola", "brand": "Coca Cola", "size": "2.25 l", "quantity": "minimum" },
    { "original": "sal gruesa", "product": "Sal gruesa", "brand": null, "size": "common", "quantity": "minimum" }
  ]
}
```

Call 1 schema (draft). Code parses `size` and `quantity` into the size and quantity it uses:

```ts
export const parseOrderOutputSchema = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        original: z.string().min(1),
        product: z.string().min(1),
        brand: z.string().min(1).nullable(),
        size: z.string().regex(/^(common|biggest|smallest|\d+(\.\d+)? (ml|l|g|kg))$/),
        quantity: z.string().regex(/^(minimum|\d+(\.\d+)? (unit|kg|g))$/),
      }),
    )
    .min(1),
});
```

## Call 2 prompt (draft)

```markdown
# Role
You check which catalog products fit what an Owner asked for in a grocery order written in Argentine Spanish.

# Context
Each line comes inside a <line> tag with:
- <original>: the Owner's own words.
- <product> and <brand>: how a previous step understood them. That step can be wrong; the Owner's words win.
- <also-in-this-line>, when present: other products the Owner named in the same words. They are handled apart; this line is only <product>.
- <candidates>: products of the Carrefour Argentina catalog that a search found, each with a number. All are in stock.
Code later picks one product among the ones you keep, by size, promotions and price.

# Goal
1. For each line, keep every candidate that fits the Owner's words. This step is important.
2. Leave out every candidate that is a different thing, variant or brand.
3. When no candidate fits, ask the Owner one short question.

# Rules
- Keep all candidates that fit. Never pick a favourite: code picks.
- Ignore size and price. Code applies them later.
- A variant the Owner asked for must be in the product: "light", "zero", "descremada", "sin TACC".
- When the Owner asked for no variant, keep only the standard version: leave out zero, light, diet, flavoured and seasoned ones.
- Leave out packs ("x6", "pack", "caja de 12") unless the Owner said "pack" or similar.
- A misspelt name or brand still fits: "porsalud" is Port Salut, "Ligth" is light.
- When the Owner named a brand and no candidate has it, keep the candidates that fit everything else, and say so in `note`.
- Ask a question only when no candidate fits at all.

# Guardrails
- Use only candidate numbers given for that line. Never invent a product. This step is important.
- Answer every line exactly once.
- Write `note` and `question` in Argentine Spanish, short, to the Owner.

# Output
Return `lines`, one entry per input line:
- `line`: the line number.
- `fits`: the numbers of the candidates that fit. Empty only when none fits.
- `note`: what the Owner should know about this line, or null. Only for a brand that is not there or a word you read differently ("Tomé 'porsalud' como Port Salut").
- `question`: one question to the Owner when `fits` is empty, or null.
```

Its examples (Port Salut light, coca normal, provoleta Santa Julia, carbón, an unmatched cerveza) and schema were drafted in the same conversation:

```ts
export const fitProductsOutputSchema = z.strictObject({
  lines: z.array(
    z.strictObject({
      line: z.number().int().positive(),
      fits: z.array(z.number().int().positive()),
      note: z.string().min(1).nullable(),
      question: z.string().min(1).nullable(),
    }),
  ),
});
```

Code checks what the schema cannot: one answer per input line, every number among that line's Matches, and `question` set exactly when `fits` is empty.

## Facts gathered

- Carrefour sells products by weight in steps of `unitMultiplier`, read live (`docs/references/carrefour-api.md`, `src/adapters/carrefour/carrefour-store.ts:239`). Live values on 2026-10-15: picaña 0.6 kg, asado 1.2 kg, plancha de asado 10 kg, jamón cocido 0.1 or 0.2 kg, tomate 0.25 kg, banana 0.5 kg. The Catalog Snapshot does not carry it (`measureUnit`, `consumptionQuantity` and `conversionFactor` only).
- In-stock products: 15,180; 11,201 of them under a mapped Tipo, 712,684 characters of name, brand and price (about 200k tokens, estimated).
- Carrefour's live search corrects typos ("porsalud" returns Port Salut) but returns mugs for "coca cola grande" and nothing for "sal gruesa".
- No provoleta Santa Julia exists: Santa Julia is a wine brand.
