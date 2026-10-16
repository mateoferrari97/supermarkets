import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, PackageSize } from "./catalog-product.ts";
import { matchOrder, orderRunOf, pickOnSnapshot } from "./eval-run.ts";
import type { Item } from "./item.ts";

const coca = (itemId: string, price: number | null, size: PackageSize | null): CatalogProduct => ({
  productId: `p${itemId}`,
  itemId,
  name: `Coca ${itemId}`,
  brand: "Coca-Cola",
  department: "Bebidas",
  tipo: "Gaseosas",
  price,
  inStock: true,
  sale: { kind: "packaged", size },
  teasers: [],
});

const ml = (amount: number): PackageSize => ({ dimension: "volume", amount });

const item = (fields: Partial<Item> = {}): Item => ({
  original: "coca grande",
  product: "Gaseosa cola",
  brand: "Coca Cola",
  size: { kind: "biggest" },
  quantity: { kind: "minimum" },
  ...fields,
});

describe("pickOnSnapshot", () => {
  it("picks the Candidate the Selection Policy ranks first on snapshot prices", async () => {
    const fits = [coca("1", 900, ml(354)), coca("3", 3300, ml(2250)), coca("2", 3200, ml(2250))];
    assert.equal((await pickOnSnapshot(item(), fits))?.product.itemId, "2");
  });

  it("skips Candidates without a snapshot price and picks nothing without Fits", async () => {
    const fits = [coca("1", null, ml(2250)), coca("2", 3200, ml(2250))];
    assert.equal((await pickOnSnapshot(item(), fits))?.product.itemId, "2");
    assert.equal(await pickOnSnapshot(item(), [coca("1", null, ml(2250))]), null);
    assert.equal(await pickOnSnapshot(item(), []), null);
  });

  it("keeps the quantity and the Notes of the size rule", async () => {
    const picked = await pickOnSnapshot(
      item({
        size: { kind: "exact", dimension: "volume", amount: 3000 },
        quantity: { kind: "units", count: 2 },
      }),
      [coca("1", 3200, ml(2250))],
    );
    assert.equal(picked?.quantity, 2);
    assert.deepEqual(picked?.notes, ["No hay de 3 l; llevo 2,25 l"]);
  });
});

describe("orderRunOf", () => {
  it("keeps product ids and picks only Items without a question", async () => {
    const small = coca("1", 900, ml(354));
    const big = coca("2", 3200, ml(2250));
    assert.deepEqual(
      await orderRunOf({
        ignoredPreference: true,
        items: [
          {
            item: item(),
            matches: [small, big],
            fits: [small, big],
            note: "Tomé coca",
            question: null,
          },
          {
            item: item({ original: "birra" }),
            matches: [small],
            fits: [],
            note: null,
            question: { text: "¿Cuál birra?", alternatives: [small] },
          },
        ],
      }),
      {
        ignoredPreference: true,
        items: [
          {
            item: item(),
            matches: ["p1", "p2"],
            fits: ["p1", "p2"],
            alternatives: [],
            note: "Tomé coca",
            question: null,
            pick: { productId: "p2", quantity: 1, notes: [] },
          },
          {
            item: item({ original: "birra" }),
            matches: ["p1"],
            fits: [],
            alternatives: ["p1"],
            note: null,
            question: "¿Cuál birra?",
            pick: null,
          },
        ],
      },
    );
  });
});

describe("matchOrder", () => {
  it("reads the order with call 1 and matches its Items with the search and call 2", async () => {
    const big = coca("2", 3200, ml(2250));
    const searched: unknown[] = [];
    const matched = await matchOrder("coca grande, pago con Visa", {
      search: {
        findMatches: (searchItem) => {
          searched.push(searchItem);
          return [big];
        },
      },
      llm: {
        parseOrder: (orderText) =>
          Promise.resolve({ items: [item({ original: orderText })], ignoredPreference: true }),
        fitProducts: () => Promise.resolve({ fits: [1], closest: [], note: null, question: null }),
      },
    });
    assert.equal(matched.ignoredPreference, true);
    assert.deepEqual(matched.items, [
      {
        item: item({ original: "coca grande, pago con Visa" }),
        matches: [big],
        fits: [big],
        note: null,
        question: null,
      },
    ]);
    assert.equal(searched.length, 1);
  });
});
