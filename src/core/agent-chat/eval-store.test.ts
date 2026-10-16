import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { catalog, product } from "./agent-chat-fixtures.ts";
import { snapshotStore } from "./eval-store.ts";

const signal = new AbortController().signal;

const weighed = product("5", "Asado a granel", 10000, {
  sale: { kind: "by-weight", saleStepKg: 0.5 },
});

describe("snapshotStore", () => {
  it("delivers everywhere except where it is told not to", async () => {
    const store = snapshotStore(catalog, { doesNotDeliver: ["9999"] });
    assert.equal(await store.checkDelivery("1425", signal), "delivers");
    assert.equal(await store.checkDelivery("9999", signal), "does-not-deliver");
  });

  it("prices a line at the snapshot price and a weighed line by its Sale Step", async () => {
    const store = snapshotStore([...catalog, weighed]);
    const { lines, total } = await store.simulate(
      {
        postalCode: "1425",
        items: [
          { itemId: "10", quantity: 2 },
          { itemId: "50", quantity: 3 },
        ],
      },
      signal,
    );
    assert.deepEqual(
      lines.map(({ available, total }) => [available, total]),
      [
        [true, 2000],
        [true, 15000],
      ],
    );
    assert.equal(total, 17000);
  });

  it("marks a product out of stock or unknown as unavailable", async () => {
    const store = snapshotStore([product("6", "Agotado", 100, { inStock: false })]);
    const { lines, total } = await store.simulate(
      {
        postalCode: "1425",
        items: [
          { itemId: "60", quantity: 1 },
          { itemId: "404", quantity: 1 },
        ],
      },
      signal,
    );
    assert.deepEqual(
      lines.map(({ available }) => available),
      [false, false],
    );
    assert.equal(total, 0);
  });

  it("builds a cart link from the items", () => {
    const store = snapshotStore(catalog);
    assert.equal(
      store.cartLink([
        { itemId: "10", quantity: 2 },
        { itemId: "20", quantity: 1 },
      ]),
      "https://eval.invalid/cart?10x2,20x1",
    );
  });
});
