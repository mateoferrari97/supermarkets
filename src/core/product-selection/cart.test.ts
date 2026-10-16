import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, Sale, Teaser } from "../order-matching/catalog-product.ts";
import type { Item } from "../order-matching/item.ts";
import { candidatesFor } from "./candidates.ts";
import { simulateCart, type Bought, type ItemToBuy } from "./cart.ts";
import type { OnlineStore, SimulationRequest } from "./online-store.ts";

const packaged = (dimension: "volume" | "weight", amount: number): Sale => ({
  kind: "packaged",
  size: { dimension, amount },
});

const product = (
  itemId: string,
  name: string,
  price: number,
  sale: Sale,
  teasers: Teaser[] = [],
): CatalogProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price,
  inStock: true,
  sale,
  teasers,
});

const yerba = product("1", "Yerba mate Playadito 1 kg", 3000, packaged("weight", 1000));
const cocaZero = product("2", "Gaseosa Coca Cola Zero 2 l", 2000, packaged("volume", 2000), [
  { name: "2do al 50%", minimumQuantity: 2 },
]);
const cocaZeroChica = product("3", "Gaseosa Coca Cola Zero 1,5 l", 1800, packaged("volume", 1500));
const sancor = product("4", "Queso Port Salut Sancor 500 g", 4000, packaged("weight", 500));
const serenisima = product(
  "5",
  "Queso Port Salut La Serenísima 500 g",
  4200,
  packaged("weight", 500),
);
const catalog = [yerba, cocaZero, cocaZeroChica, sancor, serenisima];

const item = (original: string, overrides: Partial<Item> = {}): Item => ({
  original,
  product: original,
  brand: null,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
  ...overrides,
});

const choose = (line: Item, products: CatalogProduct[], note: string | null = null): ItemToBuy => ({
  original: line.original,
  note,
  candidates: candidatesFor(line, products),
  kept: false,
});

const keep = (line: Item, bought: CatalogProduct): ItemToBuy => ({
  ...choose(line, [bought]),
  kept: true,
});

type Store = { unavailableAlone?: string[]; unavailableInCart?: string[] };

const store = ({ unavailableAlone = [], unavailableInCart = [] }: Store = {}) => {
  const simulations: SimulationRequest[] = [];
  const priceOf = (itemId: string) => catalog.find((known) => known.itemId === itemId)!.price!;
  const fake: OnlineStore = {
    checkDelivery: () => Promise.resolve("delivers"),
    simulate: (request) => {
      simulations.push(request);
      const unavailable = request.items.length === 1 ? unavailableAlone : unavailableInCart;
      const lines = request.items.map(({ itemId, quantity }) => {
        const unit = quantity >= 2 && itemId === "2" ? priceOf(itemId) * 0.75 : priceOf(itemId);
        return {
          itemId,
          quantity,
          available: !unavailable.includes(itemId),
          total: unit * quantity,
          savings: 0,
          promotions: [],
        };
      });
      const total = lines.reduce((sum, line) => sum + (line.available ? line.total : 0), 0);
      return Promise.resolve({ lines, total });
    },
    cartLink: (cart) =>
      `cart:${cart.map(({ itemId, quantity }) => `${itemId}x${quantity}`).join(",")}`,
  };
  return { fake, simulations };
};

const simulated = (items: ItemToBuy[], fake: OnlineStore) =>
  simulateCart(items, "1425", fake, new AbortController().signal);

const linesOf = (bought: Bought[]) =>
  bought.map((result) =>
    result.kind === "bought"
      ? [result.line.original, result.line.product.itemId, result.line.notes]
      : [result.kind, result.note],
  );

describe("simulateCart", () => {
  it("puts the Item's Note, the Candidate's Notes and the promotion hint under the line, in that order", async () => {
    const coca = item("coca zero de 2,25", {
      size: { kind: "exact", dimension: "volume", amount: 2250 },
    });
    const { fake } = store();
    const cart = await simulated(
      [choose(coca, [cocaZero, cocaZeroChica], "Tomé 'coca' como Coca Cola.")],
      fake,
    );
    assert.deepEqual(linesOf(cart.bought), [
      [
        "coca zero de 2,25",
        "2",
        [
          "Tomé 'coca' como Coca Cola.",
          "No hay de 2,25 l; llevo 2 l",
          "Llevando 2 sale $1500.00 c/u en vez de $2000.00 (2do al 50%)",
        ],
      ],
    ]);
  });

  it("leaves out an Item whose every Candidate is unavailable in the Branch", async () => {
    const { fake } = store({ unavailableAlone: ["4", "5"] });
    const cart = await simulated(
      [choose(item("yerba"), [yerba]), choose(item("queso"), [sancor, serenisima])],
      fake,
    );
    assert.deepEqual(linesOf(cart.bought), [
      ["yerba", "1", []],
      ["not-got", 'No conseguí "queso": no hay ninguno disponible en tu sucursal'],
    ]);
    assert.equal(cart.cartLink, "cart:1x1");
  });

  it("leaves out an Item with no Candidate", async () => {
    const { fake } = store();
    const cart = await simulated([choose(item("queso"), [])], fake);
    assert.deepEqual(cart, {
      bought: [
        { kind: "not-got", note: 'No conseguí "queso": no encontré cómo llevar lo que pediste' },
      ],
      total: 0,
      cartLink: null,
    });
  });

  it("drops a Candidate unavailable alone and lets the Selection Policy pick among the rest", async () => {
    const { fake } = store({ unavailableAlone: ["4"] });
    const cart = await simulated([choose(item("queso"), [sancor, serenisima])], fake);
    assert.deepEqual(linesOf(cart.bought), [["queso", "5", []]]);
  });

  it("replaces a product unavailable in the whole cart by the Item's next ranked Candidate", async () => {
    const { fake, simulations } = store({ unavailableInCart: ["4"] });
    const cart = await simulated(
      [choose(item("yerba"), [yerba]), choose(item("queso"), [sancor, serenisima])],
      fake,
    );
    assert.deepEqual(linesOf(cart.bought), [
      ["yerba", "1", []],
      [
        "queso",
        "5",
        [
          '"Queso Port Salut Sancor 500 g" no estaba disponible al armar el carrito: lo cambié por "Queso Port Salut La Serenísima 500 g"',
        ],
      ],
    ]);
    assert.equal(cart.total, 7200);
    assert.equal(cart.cartLink, "cart:1x1,5x1");
    assert.deepEqual(
      simulations.filter(({ items }) => items.length > 1).map(({ items }) => items),
      [
        [
          { itemId: "1", quantity: 1 },
          { itemId: "4", quantity: 1 },
        ],
        [
          { itemId: "1", quantity: 1 },
          { itemId: "5", quantity: 1 },
        ],
      ],
    );
  });

  it("keeps the product of a kept Item without pricing it alone or hinting a promotion", async () => {
    const { fake, simulations } = store({ unavailableAlone: ["2"] });
    const cart = await simulated(
      [keep(item("coca zero"), cocaZero), choose(item("yerba"), [yerba])],
      fake,
    );
    assert.deepEqual(linesOf(cart.bought), [
      ["coca zero", "2", []],
      ["yerba", "1", []],
    ]);
    assert.deepEqual(
      simulations.map(({ items }) => items.map(({ itemId }) => itemId)),
      [["1"], ["2", "1"]],
    );
  });

  it("leaves out a kept Item with a Note when its product is gone from the whole cart", async () => {
    const { fake } = store({ unavailableInCart: ["4"] });
    const cart = await simulated(
      [choose(item("yerba"), [yerba]), keep(item("queso porsalud"), sancor)],
      fake,
    );
    assert.deepEqual(linesOf(cart.bought), [
      ["yerba", "1", []],
      [
        "not-got",
        'No conseguí "queso porsalud": "Queso Port Salut Sancor 500 g" no estaba disponible al armar el carrito',
      ],
    ]);
  });
});
