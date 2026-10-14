import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item } from "../order-resolution/llm.ts";
import type { OrderItem, OrderResolution } from "../order-resolution/resolve-order.ts";
import { pickProducts } from "./pick-products.ts";
import type {
  CandidateQuery,
  OnlineStore,
  SimulatedLine,
  SimulationItem,
  StoreProduct,
} from "./store.ts";

const mapping = {
  Gaseosa: "gaseosa",
  "Gaseosa light": "gaseosa",
  Yerba: "yerba",
  "Yerba compuesta": "yerba-compuesta",
  "Leche balsámica": null,
};

const product = (itemId: string, name: string, ml: number | null): StoreProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  measure: ml === null ? null : { dimension: "volume", amount: ml },
});

type Price = { unit: number; savings?: number; promotion?: string; available?: boolean };

const fakeStore = (
  candidates: (query: CandidateQuery) => StoreProduct[],
  prices: Record<string, Price>,
) => {
  const queries: CandidateQuery[] = [];
  const simulations: SimulationItem[][] = [];
  const store: OnlineStore = {
    findCandidates: (query) => {
      queries.push(query);
      return Promise.resolve(candidates(query));
    },
    simulate: (_postalCode, items) => {
      simulations.push(items);
      const lines = items.map(({ itemId, quantity }): SimulatedLine => {
        const price = prices[itemId] ?? { unit: 0, available: false };
        return {
          itemId,
          quantity,
          available: price.available ?? true,
          total: price.unit * quantity,
          savings: price.savings ?? 0,
          promotions: price.promotion ? [price.promotion] : [],
        };
      });
      const total = lines
        .filter(({ available }) => available)
        .reduce((sum, { total }) => sum + total, 0);
      return Promise.resolve({ lines, total });
    },
  };
  return { store, queries, simulations };
};

const orderItem = (phrase: string, ids: string[], overrides: Partial<Item> = {}): OrderItem => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  ...overrides,
  productTypes: ids.map((id) => ({ id, name: id })),
  question: null,
});

const order = (...items: OrderItem[]): OrderResolution => ({
  items,
  postalCode: "1425",
  message: null,
});

const coca = product("3807", "Coca Cola 2,25 lts", 2250);
const zero = product("11324", "Coca Cola Zero 2,25 lts", 2250);
const lata = product("1000", "Coca Cola lata 354 ml", 354);

describe("pickProducts", () => {
  it("searches the Item's Tipos, brand and postal code for two Candidates sorted by discount", async () => {
    const { store, queries } = fakeStore(() => [], {});
    await pickProducts(
      order(
        orderItem("coca", ["gaseosa"], { brand: "Coca-Cola" }),
        orderItem("yerba", ["yerba", "yerba-compuesta"]),
      ),
      {
        mapping,
        store,
      },
    );
    assert.deepEqual(queries, [
      {
        postalCode: "1425",
        tipos: ["Gaseosa", "Gaseosa light"],
        brand: "Coca-Cola",
        sort: "discount:desc",
        limit: 10,
      },
      {
        postalCode: "1425",
        tipos: ["Yerba", "Yerba compuesta"],
        brand: null,
        sort: "discount:desc",
        limit: 10,
      },
    ]);
  });

  it("simulates each Candidate alone and picks the one with savings first", async () => {
    const { store, simulations } = fakeStore(() => [zero, coca], {
      "11324": { unit: 4000 },
      "3807": { unit: 4500, savings: 3000, promotion: "2do al 50%" },
    });
    const selection = await pickProducts(order(orderItem("coca", ["gaseosa"], { quantity: 2 })), {
      mapping,
      store,
    });
    assert.deepEqual(simulations.slice(0, 2), [
      [{ itemId: "11324", quantity: 2 }],
      [{ itemId: "3807", quantity: 2 }],
    ]);
    assert.deepEqual(simulations.at(-1), [{ itemId: "3807", quantity: 2 }]);
    assert.deepEqual(selection, {
      lines: [
        {
          phrase: "coca",
          product: coca,
          quantity: 2,
          unitPrice: 4500,
          total: 9000,
          reason: "Promoción: 2do al 50%.",
        },
      ],
      total: 9000,
    });
  });

  it("without savings picks the lowest price per unit of measure, not per package", async () => {
    const { store } = fakeStore(() => [lata, coca], {
      "1000": { unit: 1000 },
      "3807": { unit: 6000 },
    });
    const { lines } = await pickProducts(order(orderItem("coca", ["gaseosa"])), { mapping, store });
    assert.equal(lines[0]?.product, coca);
    assert.equal(lines[0]?.reason, "Es el más barato por litro.");
  });

  it("breaks a tie by the lowest itemId and compares package prices when measures are unknown", async () => {
    const tie = fakeStore(() => [coca, zero], { "3807": { unit: 6000 }, "11324": { unit: 6000 } });
    assert.equal(
      (await pickProducts(order(orderItem("coca", ["gaseosa"])), { mapping, store: tie.store }))
        .lines[0]?.product,
      coca,
    );
    const unknown = [product("2", "Yerba A", null), product("1", "Yerba B", null)];
    const plain = fakeStore(() => unknown, { "2": { unit: 3000 }, "1": { unit: 3500 } });
    assert.equal(
      (await pickProducts(order(orderItem("yerba", ["yerba"])), { mapping, store: plain.store }))
        .lines[0]?.product,
      unknown[0],
    );
  });

  it("skips a Candidate unavailable in its simulation and simulates the next result instead", async () => {
    const { store, simulations } = fakeStore(() => [coca, zero, lata], {
      "3807": { unit: 4500, savings: 3000, available: false },
      "11324": { unit: 6000 },
      "1000": { unit: 1000 },
    });
    const { lines } = await pickProducts(order(orderItem("coca", ["gaseosa"])), { mapping, store });
    assert.deepEqual(
      simulations.slice(0, 3).map(([first]) => first?.itemId),
      ["3807", "11324", "1000"],
    );
    assert.equal(lines[0]?.product, zero);
    assert.equal(lines[0]?.reason, "Es el más barato por litro.");
  });

  it("says when only one Candidate was available", async () => {
    const { store } = fakeStore(() => [coca, zero], {
      "3807": { unit: 4500, available: false },
      "11324": { unit: 6000 },
    });
    const { lines } = await pickProducts(order(orderItem("coca", ["gaseosa"])), { mapping, store });
    assert.equal(lines[0]?.reason, "Es el único disponible entre los candidatos.");
  });

  it("buys once with no quantity, rounds a fraction up, and reports an Item with nothing available", async () => {
    const { store, simulations } = fakeStore(
      (query) => (query.tipos.includes("Yerba") ? [] : [coca]),
      {
        "3807": { unit: 6000 },
      },
    );
    const selection = await pickProducts(
      order(
        orderItem("coca", ["gaseosa"]),
        orderItem("media coca", ["gaseosa"], { quantity: 0.5 }),
        orderItem("yerba", ["yerba"]),
      ),
      { mapping, store },
    );
    assert.deepEqual(simulations.at(-1), [
      { itemId: "3807", quantity: 1 },
      { itemId: "3807", quantity: 1 },
    ]);
    assert.deepEqual(selection.lines[2], {
      phrase: "yerba",
      product: null,
      quantity: 1,
      unitPrice: null,
      total: 0,
      reason: "No encontré ningún producto disponible.",
    });
  });

  it("takes prices and the total from the final simulation of the whole cart", async () => {
    let calls = 0;
    const { store } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
    const finalStore: OnlineStore = {
      ...store,
      simulate: (postalCode, items) => {
        calls += 1;
        if (calls === 1) return store.simulate(postalCode, items);
        return Promise.resolve({
          lines: [
            {
              itemId: "3807",
              quantity: 1,
              available: true,
              total: 5500,
              savings: 500,
              promotions: ["Precio final"],
            },
          ],
          total: 5500,
        });
      },
    };
    const selection = await pickProducts(order(orderItem("coca", ["gaseosa"])), {
      mapping,
      store: finalStore,
    });
    assert.equal(selection.total, 5500);
    assert.equal(selection.lines[0]?.unitPrice, 5500);
    assert.equal(selection.lines[0]?.reason, "Promoción: Precio final.");
  });

  it("refuses an order that still has questions or no postal code", async () => {
    const { store } = fakeStore(() => [], {});
    await assert.rejects(
      pickProducts({ ...order(), message: "Tengo una pregunta" }, { mapping, store }),
    );
    await assert.rejects(pickProducts({ ...order(), postalCode: null }, { mapping, store }));
  });

  it("keeps only products whose name has every term, searching deeper when there are terms", async () => {
    const { store, queries } = fakeStore(() => [lata, zero, coca], {
      "1000": { unit: 1000 },
      "11324": { unit: 6000 },
      "3807": { unit: 5900 },
    });
    const { lines } = await pickProducts(
      order(orderItem("coca", ["gaseosa"], { terms: ["2,25 l"] })),
      {
        mapping,
        store,
      },
    );
    assert.equal(queries[0]?.limit, 50);
    assert.equal(lines[0]?.product, coca);
  });
});
