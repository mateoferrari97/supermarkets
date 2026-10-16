import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, PackageSize } from "../order-matching/catalog-product.ts";
import type { Item, Quantity, Size } from "../order-matching/item.ts";
import type { OnlineStore } from "./online-store.ts";
import {
  candidatesFor,
  rankCandidates,
  simulatedPrice,
  simulatedPrices,
  snapshotPrices,
  snapshotTotal,
  type Candidate,
  type PriceSource,
} from "./selection.ts";

const packaged = (
  itemId: string,
  price: number | null,
  size: PackageSize | null,
  name = `Producto ${itemId}`,
): CatalogProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price,
  inStock: true,
  sale: { kind: "packaged", size },
  teasers: [],
});

const byWeight = (itemId: string, pricePerKg: number, saleStepKg: number): CatalogProduct => ({
  ...packaged(itemId, pricePerKg, null),
  sale: { kind: "by-weight", saleStepKg },
});

const ml = (amount: number): PackageSize => ({ dimension: "volume", amount });
const grams = (amount: number): PackageSize => ({ dimension: "weight", amount });
const units = (amount: number): PackageSize => ({ dimension: "units", amount });

const item = (product: string, size: Size, quantity: Quantity = { kind: "minimum" }): Item => ({
  original: product,
  product,
  brand: null,
  size,
  quantity,
});

const picked = (candidates: Candidate[]) =>
  candidates.map(({ product, quantity, notes }) => ({ itemId: product.itemId, quantity, notes }));

const cocas = [
  packaged("1", 900, ml(354)),
  packaged("2", 1500, ml(500)),
  packaged("3", 2500, ml(1500)),
  packaged("4", 3000, ml(2000)),
  packaged("5", 3200, ml(2250)),
  packaged("6", 3300, ml(2250)),
  packaged("7", 1600, ml(500)),
];

describe("candidatesFor", () => {
  it.each<[string, Item, CatalogProduct[], ReturnType<typeof picked>]>([
    [
      "coca grande picks the biggest size",
      item("coca", { kind: "biggest" }),
      cocas,
      [
        { itemId: "5", quantity: 1, notes: [] },
        { itemId: "6", quantity: 1, notes: [] },
      ],
    ],
    [
      "coca chica picks the smallest size",
      item("coca", { kind: "smallest" }),
      cocas,
      [{ itemId: "1", quantity: 1, notes: [] }],
    ],
    [
      "coca 2.25 l takes that size",
      item("coca", { kind: "exact", dimension: "volume", amount: 2250 }),
      cocas,
      [
        { itemId: "5", quantity: 1, notes: [] },
        { itemId: "6", quantity: 1, notes: [] },
      ],
    ],
    [
      "a missing 2.25 l takes the nearest size with a Note",
      item(
        "coca",
        { kind: "exact", dimension: "volume", amount: 2250 },
        { kind: "units", count: 2 },
      ),
      cocas.filter(({ itemId }) => itemId !== "5" && itemId !== "6"),
      [{ itemId: "4", quantity: 2, notes: ["No hay de 2,25 l; llevo 2 l"] }],
    ],
    [
      "a tie between nearest sizes takes the bigger",
      item("coca", { kind: "exact", dimension: "volume", amount: 1000 }),
      [packaged("1", 2000, ml(1500)), packaged("2", 500, ml(500))],
      [{ itemId: "1", quantity: 1, notes: ["No hay de 1 l; llevo 1,5 l"] }],
    ],
    [
      "an exact size with no Fit of its dimension is ignored with a Note",
      item("coca", { kind: "exact", dimension: "volume", amount: 2250 }),
      [packaged("1", 100, null)],
      [{ itemId: "1", quantity: 1, notes: ["No hay de 2,25 l"] }],
    ],
    [
      "common takes the mode size and Fits without size",
      item("coca", { kind: "common" }),
      [...cocas, packaged("8", 100, null), packaged("9", 1700, ml(500))],
      [
        { itemId: "2", quantity: 1, notes: [] },
        { itemId: "7", quantity: 1, notes: [] },
        { itemId: "9", quantity: 1, notes: [] },
        { itemId: "8", quantity: 1, notes: [] },
      ],
    ],
    [
      "a mode tie goes to the size whose cheapest Fit is cheapest per unit",
      item("leche", { kind: "common" }),
      [
        packaged("1", 1000, ml(1000)),
        packaged("2", 1200, ml(1000)),
        packaged("3", 400, ml(500)),
        packaged("4", 600, ml(500)),
      ],
      [
        { itemId: "3", quantity: 1, notes: [] },
        { itemId: "4", quantity: 1, notes: [] },
      ],
    ],
    [
      "common applies no size rule when every Fit is sold by weight",
      item("banana", { kind: "common" }),
      [byWeight("1", 2000, 0.5), byWeight("2", 1800, 1)],
      [
        { itemId: "2", quantity: 1, notes: [] },
        { itemId: "1", quantity: 1, notes: [] },
      ],
    ],
    [
      "biggest counts only the majority dimension",
      item("yerba", { kind: "biggest" }),
      [
        packaged("1", 3000, grams(500)),
        packaged("2", 5000, grams(1000)),
        packaged("3", 9000, units(10)),
        byWeight("4", 100, 5),
      ],
      [{ itemId: "2", quantity: 1, notes: [] }],
    ],
    [
      "biggest is ignored with a Note when no Fit is packaged",
      item("picaña", { kind: "biggest" }),
      [byWeight("1", 24900, 1.25)],
      [
        {
          itemId: "1",
          quantity: 1,
          notes: ["Carrefour no lo vende por tamaño: no pude elegir el más grande"],
        },
      ],
    ],
    [
      "smallest is ignored with a Note when no Fit is packaged",
      item("picaña", { kind: "smallest" }),
      [byWeight("1", 24900, 1.25)],
      [
        {
          itemId: "1",
          quantity: 1,
          notes: ["Carrefour no lo vende por tamaño: no pude elegir el más chico"],
        },
      ],
    ],
    [
      "minimum buys one unit or one Sale Step",
      item("jamón", { kind: "common" }),
      [packaged("1", 3000, null), byWeight("2", 20000, 0.1)],
      [
        { itemId: "2", quantity: 1, notes: [] },
        { itemId: "1", quantity: 1, notes: [] },
      ],
    ],
    [
      "units buys that many packages",
      item("coca", { kind: "biggest" }, { kind: "units", count: 2 }),
      cocas,
      [
        { itemId: "5", quantity: 2, notes: [] },
        { itemId: "6", quantity: 2, notes: [] },
      ],
    ],
    [
      "units prefer packaged Fits over Fits sold by weight",
      item("manzana", { kind: "common" }, { kind: "units", count: 3 }),
      [byWeight("1", 100, 0.5), packaged("2", 5000, units(1))],
      [{ itemId: "2", quantity: 3, notes: [] }],
    ],
    [
      "3 manzanas with only Fits sold by weight buys 1.5 kg with a Note",
      item("manzana", { kind: "common" }, { kind: "units", count: 3 }),
      [byWeight("1", 2000, 0.5)],
      [{ itemId: "1", quantity: 3, notes: ["Carrefour vende por kg: llevo 1,5 kg"] }],
    ],
    [
      "picaña 2 kg at a 1.25 kg Sale Step buys 2.5 kg with a Note",
      item("picaña", { kind: "common" }, { kind: "weight", grams: 2000 }),
      [byWeight("1", 24900, 1.25)],
      [{ itemId: "1", quantity: 2, notes: ["Picaña se vende de a 1,25 kg: llevo 2,5 kg"] }],
    ],
    [
      "a weight below one Sale Step buys one Sale Step",
      item("picaña", { kind: "common" }, { kind: "weight", grams: 300 }),
      [byWeight("1", 24900, 1.25)],
      [{ itemId: "1", quantity: 1, notes: ["Picaña se vende de a 1,25 kg: llevo 1,25 kg"] }],
    ],
    [
      "a weight rounds up to the next Sale Step",
      item("banana", { kind: "common" }, { kind: "weight", grams: 1200 }),
      [byWeight("1", 2000, 0.5)],
      [{ itemId: "1", quantity: 3, notes: ["Banana se vende de a 500 g: llevo 1,5 kg"] }],
    ],
    [
      "cuadril 2.7 kg at a 0.8 kg Sale Step buys 3.2 kg, not the nearer 2.4 kg",
      item("cuadril", { kind: "common" }, { kind: "weight", grams: 2700 }),
      [byWeight("1", 19800, 0.8)],
      [{ itemId: "1", quantity: 4, notes: ["Cuadril se vende de a 800 g: llevo 3,2 kg"] }],
    ],
    [
      "colita de cuadril 2.5 kg at a 1.2 kg Sale Step buys 3.6 kg",
      item("colita de cuadril", { kind: "common" }, { kind: "weight", grams: 2500 }),
      [byWeight("1", 22900, 1.2)],
      [
        {
          itemId: "1",
          quantity: 3,
          notes: ["Colita de cuadril se vende de a 1,2 kg: llevo 3,6 kg"],
        },
      ],
    ],
    [
      "a weight that is a multiple of the Sale Step buys it exactly without a Note",
      item("cuadril", { kind: "common" }, { kind: "weight", grams: 2400 }),
      [byWeight("1", 19800, 0.8)],
      [{ itemId: "1", quantity: 3, notes: [] }],
    ],
    [
      "300 g of jamón compares packages and weight by total price",
      item("jamón", { kind: "common" }, { kind: "weight", grams: 300 }),
      [
        packaged("1", 4000, grams(200)),
        byWeight("2", 25000, 0.1),
        packaged("3", 9000, grams(500)),
        packaged("4", 100, units(10)),
      ],
      [
        { itemId: "2", quantity: 3, notes: [] },
        { itemId: "1", quantity: 2, notes: [] },
        { itemId: "3", quantity: 1, notes: [] },
      ],
    ],
    [
      "a weight with an exact size buys packages of that size",
      item(
        "yerba",
        { kind: "exact", dimension: "weight", amount: 500 },
        { kind: "weight", grams: 1000 },
      ),
      [packaged("1", 3000, grams(500)), packaged("2", 5000, grams(1000))],
      [{ itemId: "1", quantity: 2, notes: [] }],
    ],
  ])("%s", (_, asked, fits, expected) => {
    assert.deepEqual(picked(candidatesFor(asked, fits)), expected);
  });

  it("keeps the 10 cheapest per unit of measure", () => {
    const fits = Array.from({ length: 14 }, (_, index) =>
      packaged(String(index + 1), 1000 + (14 - index) * 10, ml(1000)),
    );
    assert.deepEqual(
      candidatesFor(item("agua", { kind: "common" }), fits).map(({ product }) => product.itemId),
      ["14", "13", "12", "11", "10", "9", "8", "7", "6", "5"],
    );
  });

  it("ranks Fits without a price last", () => {
    assert.deepEqual(
      candidatesFor(item("agua", { kind: "common" }), [
        packaged("1", null, ml(1000)),
        packaged("2", 900, ml(1000)),
      ]).map(({ product }) => product.itemId),
      ["2", "1"],
    );
  });

  it("returns no Candidates without Fits", () => {
    assert.deepEqual(candidatesFor(item("agua", { kind: "common" }), []), []);
  });
});

describe("snapshotTotal", () => {
  it("multiplies the price per kg by the kilos bought", () => {
    const [candidate] = candidatesFor(
      item("picaña", { kind: "common" }, { kind: "weight", grams: 2000 }),
      [byWeight("1", 24000, 1.25)],
    );
    assert.equal(snapshotTotal(candidate!), 60000);
  });

  it("multiplies the price by the packages bought", () => {
    const [candidate] = candidatesFor(
      item("coca", { kind: "common" }, { kind: "units", count: 3 }),
      [packaged("1", 2000, ml(2250))],
    );
    assert.equal(snapshotTotal(candidate!), 6000);
  });
});

const storeOf = (catalog: CatalogProduct[], savings: Record<string, number> = {}): OnlineStore => ({
  checkDelivery: () => Promise.resolve("delivers"),
  simulate: ({ items }) => {
    const lines = items.map(({ itemId, quantity }) => {
      const product = catalog.find((candidate) => candidate.itemId === itemId)!;
      const total =
        snapshotTotal({ product, quantity, measured: 1, notes: [] }) ?? Number.POSITIVE_INFINITY;
      return {
        itemId,
        quantity,
        available: product.price !== null,
        total,
        savings: savings[itemId] ?? 0,
        promotions: [],
      };
    });
    return Promise.resolve({ lines, total: lines.reduce((sum, line) => sum + line.total, 0) });
  },
  cartLink: () => "https://carrefour.test/cart",
});

const simulatedFrom = (catalog: CatalogProduct[], savings: Record<string, number> = {}) => {
  const signal = new AbortController().signal;
  return simulatedPrices(simulatedPrice("1414", storeOf(catalog, savings), signal), signal);
};

const ranked = async (asked: Item, fits: CatalogProduct[], prices: PriceSource) => {
  const [perItem] = await rankCandidates([candidatesFor(asked, fits)], prices);
  return perItem!.map(({ candidate }) => candidate.product.itemId);
};

const priceSources: [string, (catalog: CatalogProduct[]) => PriceSource][] = [
  ["snapshot prices", () => snapshotPrices],
  ["simulated prices", (catalog) => simulatedFrom(catalog)],
];

describe.each(priceSources)("Selection Policy with %s", (_, pricesFor) => {
  it.each<[string, Item, CatalogProduct[], string[]]>([
    [
      "compares price per unit of measure across sizes and by weight",
      item("queso", { kind: "common" }, { kind: "weight", grams: 1000 }),
      [packaged("1", 3000, grams(500)), packaged("2", 1400, grams(250)), byWeight("3", 5800, 0.5)],
      ["2", "3", "1"],
    ],
    [
      "breaks a tie between the most common sizes by the lowest price per unit",
      item("agua", { kind: "common" }),
      [
        packaged("1", 1000, ml(500)),
        packaged("2", 1100, ml(500)),
        packaged("3", 1900, ml(1000)),
        packaged("4", 1800, ml(1000)),
      ],
      ["4", "3"],
    ],
    [
      "breaks a tie by the lowest itemId",
      item("agua", { kind: "common" }),
      [
        packaged("10", 1000, ml(1000)),
        packaged("9", 1000, ml(1000)),
        packaged("11", 1000, ml(1000)),
      ],
      ["9", "10", "11"],
    ],
    [
      "leaves out a Candidate without a price",
      item("agua", { kind: "common" }),
      [packaged("1", null, ml(1000)), packaged("2", 1200, ml(1000))],
      ["2"],
    ],
    ["ranks nothing without Fits", item("agua", { kind: "common" }), [], []],
  ])("%s", async (_, asked, fits, expected) => {
    assert.deepEqual(await ranked(asked, fits, pricesFor(fits)), expected);
  });
});

describe("Selection Policy with simulated savings", () => {
  it("puts savings before a lower price per unit", async () => {
    const fits = [packaged("1", 900, ml(1000)), packaged("2", 1200, ml(1000))];
    assert.deepEqual(
      await ranked(item("agua", { kind: "common" }), fits, simulatedFrom(fits, { "2": 100 })),
      ["2", "1"],
    );
  });

  it("compares price per unit among Candidates with savings", async () => {
    const fits = [packaged("1", 1000, ml(1000)), packaged("2", 900, ml(1000))];
    assert.deepEqual(
      await ranked(
        item("agua", { kind: "common" }),
        fits,
        simulatedFrom(fits, { "1": 50, "2": 10 }),
      ),
      ["2", "1"],
    );
  });
});

describe("rankCandidates", () => {
  it("ranks the Candidates of each Item apart", async () => {
    const water = [packaged("1", 1200, ml(1000)), packaged("2", 1000, ml(1000))];
    const juice = [packaged("3", 900, ml(1000))];
    const perItem = await rankCandidates(
      [
        candidatesFor(item("agua", { kind: "common" }), water),
        [],
        candidatesFor(item("jugo", { kind: "common" }), juice),
      ],
      snapshotPrices,
    );
    assert.deepEqual(
      perItem.map((candidates) => candidates.map(({ candidate }) => candidate.product.itemId)),
      [["2", "1"], [], ["3"]],
    );
  });
});
