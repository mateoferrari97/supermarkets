import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, Sale, Teaser } from "../order-matching/catalog-product.ts";
import type { Item } from "../order-matching/item.ts";
import { candidatesFor, type Candidate } from "./selection.ts";
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
  kind: "choose",
  original: line.original,
  note,
  candidates: candidatesFor(line, products),
});

const candidateOf = (line: Item, bought: CatalogProduct): Candidate =>
  candidatesFor(line, [bought])[0]!;

const keep = (line: Item, bought: CatalogProduct, reason: string): ItemToBuy => ({
  kind: "keep",
  original: line.original,
  candidate: candidateOf(line, bought),
  reason,
});

const boughtLine = (
  line: Item,
  bought: CatalogProduct,
  reason: string,
  notes: string[] = [],
): Bought => {
  const candidate = candidateOf(line, bought);
  const total = (bought.price ?? 0) * candidate.quantity;
  return {
    kind: "bought",
    candidate,
    line: {
      original: line.original,
      product: bought,
      quantity: candidate.quantity,
      unitPrice: total / candidate.quantity,
      total,
      reason,
      notes,
    },
  };
};

type Deal = { savings: number; promotions: string[] };

type Store = {
  unavailableAlone?: string[];
  unavailableInCart?: string[];
  deals?: Record<string, Deal>;
};

const store = ({ unavailableAlone = [], unavailableInCart = [], deals = {} }: Store = {}) => {
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
          ...deals[itemId],
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

const yerbaLine = item("yerba");
const quesoLine = item("queso");
const cheapestPerKilo = "Es el más barato por kilo.";
const onlyOne = "Es el único disponible entre los candidatos.";

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
    const [candidate] = candidatesFor(coca, [cocaZero, cocaZeroChica]);
    assert.deepEqual(cart, {
      bought: [
        {
          kind: "bought",
          candidate,
          line: {
            original: "coca zero de 2,25",
            product: cocaZero,
            quantity: 1,
            unitPrice: 2000,
            total: 2000,
            reason: onlyOne,
            notes: [
              "Tomé 'coca' como Coca Cola.",
              "No hay de 2,25 l; llevo 2 l",
              "Llevando 2 sale $1500.00 c/u en vez de $2000.00 (2do al 50%)",
            ],
          },
        },
      ],
      total: 2000,
      cartLink: "cart:2x1",
    });
  });

  it("gives a line with a promotion the promotion as its reason", async () => {
    const { fake } = store({ deals: { "4": { savings: 0, promotions: ["2do al 70%"] } } });
    const cart = await simulated([choose(quesoLine, [sancor, serenisima])], fake);
    assert.deepEqual(cart.bought, [boughtLine(quesoLine, sancor, "Promoción: 2do al 70%.")]);
  });

  it("buys the Candidate with a discount first and gives the discount as its reason", async () => {
    const { fake } = store({ deals: { "5": { savings: 600, promotions: [] } } });
    const cart = await simulated([choose(quesoLine, [sancor, serenisima])], fake);
    assert.deepEqual(cart.bought, [
      boughtLine(quesoLine, serenisima, "Tiene $600.00 de descuento."),
    ]);
  });

  it("buys the cheapest per kilo when nothing has a discount", async () => {
    const { fake } = store();
    const cart = await simulated([choose(quesoLine, [serenisima, sancor])], fake);
    assert.deepEqual(cart.bought, [boughtLine(quesoLine, sancor, cheapestPerKilo)]);
  });

  it("leaves out an Item whose every Candidate is unavailable in the Branch", async () => {
    const { fake } = store({ unavailableAlone: ["4", "5"] });
    const cart = await simulated(
      [choose(yerbaLine, [yerba]), choose(quesoLine, [sancor, serenisima])],
      fake,
    );
    assert.deepEqual(cart, {
      bought: [
        boughtLine(yerbaLine, yerba, onlyOne),
        { kind: "not-got", note: 'No conseguí "queso": no hay ninguno disponible en tu sucursal' },
      ],
      total: 3000,
      cartLink: "cart:1x1",
    });
  });

  it("leaves out an Item with no Candidate", async () => {
    const { fake } = store();
    const cart = await simulated([choose(quesoLine, [])], fake);
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
    const cart = await simulated([choose(quesoLine, [sancor, serenisima])], fake);
    assert.deepEqual(cart.bought, [boughtLine(quesoLine, serenisima, onlyOne)]);
  });

  it("replaces a product unavailable in the whole cart by the Item's next ranked Candidate", async () => {
    const { fake, simulations } = store({ unavailableInCart: ["4"] });
    const cart = await simulated(
      [choose(yerbaLine, [yerba]), choose(quesoLine, [sancor, serenisima])],
      fake,
    );
    assert.deepEqual(cart, {
      bought: [
        boughtLine(yerbaLine, yerba, onlyOne),
        boughtLine(quesoLine, serenisima, cheapestPerKilo, [
          '"Queso Port Salut Sancor 500 g" no estaba disponible al armar el carrito: lo cambié por "Queso Port Salut La Serenísima 500 g"',
        ]),
      ],
      total: 7200,
      cartLink: "cart:1x1,5x1",
    });
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

  it("keeps a kept Item's product and reason with no Notes, without pricing it alone or hinting a promotion", async () => {
    const coca = item("coca zero");
    const { fake, simulations } = store({
      unavailableAlone: ["2"],
      deals: { "2": { savings: 500, promotions: ["2do al 50%"] } },
    });
    const cart = await simulated(
      [keep(coca, cocaZero, "Es el más barato por litro."), choose(yerbaLine, [yerba])],
      fake,
    );
    assert.deepEqual(cart, {
      bought: [
        boughtLine(coca, cocaZero, "Es el más barato por litro."),
        boughtLine(yerbaLine, yerba, onlyOne),
      ],
      total: 5000,
      cartLink: "cart:2x1,1x1",
    });
    assert.deepEqual(
      simulations.map(({ items }) => items.map(({ itemId }) => itemId)),
      [["1"], ["2", "1"]],
    );
  });

  it("leaves out a kept Item with a Note when its product is gone from the whole cart", async () => {
    const queso = item("queso porsalud");
    const { fake } = store({ unavailableInCart: ["4"] });
    const cart = await simulated(
      [choose(yerbaLine, [yerba]), keep(queso, sancor, cheapestPerKilo)],
      fake,
    );
    assert.deepEqual(cart, {
      bought: [
        boughtLine(yerbaLine, yerba, onlyOne),
        {
          kind: "not-got",
          note: 'No conseguí "queso porsalud": "Queso Port Salut Sancor 500 g" no estaba disponible al armar el carrito',
        },
      ],
      total: 3000,
      cartLink: "cart:1x1",
    });
  });
});
