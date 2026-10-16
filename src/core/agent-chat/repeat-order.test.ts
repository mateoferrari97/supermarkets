import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { catalog, memoryOrders, storeOf } from "./agent-chat-fixtures.ts";
import type { ChatOrder, OrderLine } from "./order.ts";
import { repeatOrder } from "./repeat-order.ts";

const signal = new AbortController().signal;

const lineOf = (productId: string, name: string, quantity: number): OrderLine => ({
  description: name,
  productId,
  itemId: `${productId}0`,
  name,
  brand: null,
  quantity,
  unitPrice: 1,
  total: quantity,
  reason: "Es el más barato.",
  notes: [],
});

const closed = (id: string, lines: OrderLine[]): ChatOrder => ({
  id,
  status: "closed",
  openedAt: "2026-10-12T12:00:00.000Z",
  items: [],
  proposals: 1,
  proposal: null,
  cart: {
    postalCode: "1425",
    lines,
    notes: [],
    total: 1,
    warning: "",
    cartLink: "https://example.test/old",
  },
});

const milk = lineOf("2", "Leche entera Sancor 1 l", 2);
const yogurt = lineOf("4", "Yogur firme Ilolay 190 g", 1);

const dependencies = (
  memory: ReturnType<typeof memoryOrders>,
  store: ReturnType<typeof storeOf>["store"],
  postalCode: string | null = "1425",
) => ({
  store,
  orders: memory.orders,
  loadProfile: () => (postalCode === null ? null : { postalCode }),
  now: () => new Date("2026-10-16T12:00:00.000Z"),
});

describe("repeatOrder", () => {
  it("opens a new Order with the same products and quantities priced today", async () => {
    const memory = memoryOrders([closed("order-1", [milk, yogurt])]);
    const { store, simulated } = storeOf(catalog);
    const output = await repeatOrder({ orderId: "order-1" }, dependencies(memory, store), signal);
    assert.deepEqual(simulated, [
      {
        postalCode: "1425",
        items: [
          { itemId: "20", quantity: 2 },
          { itemId: "40", quantity: 1 },
        ],
      },
    ]);
    assert.equal(output.kind, "repeated");
    if (output.kind !== "repeated") return;
    assert.deepEqual(
      output.items.map((item) =>
        item.kind === "picked"
          ? [item.ref, item.product.productId, item.quantity, item.total]
          : item,
      ),
      [
        ["1", "2", 2, 1600],
        ["2", "4", 1, 500],
      ],
    );
    const [, fresh] = memory.current();
    assert.equal(fresh?.id, "order-2");
    assert.equal(fresh?.status, "draft");
    assert.deepEqual(
      fresh?.items.map((item) => (item.kind === "picked" ? item.line.productId : item.kind)),
      ["2", "4"],
    );
    assert.equal(memory.current()[0]?.status, "closed");
  });

  it("says which products are no longer available and keeps the rest", async () => {
    const memory = memoryOrders([closed("order-1", [milk, yogurt])]);
    const { store, simulated } = storeOf(catalog, ["20"]);
    const output = await repeatOrder({ orderId: "order-1" }, dependencies(memory, store), signal);
    assert.deepEqual(simulated.at(-1)?.items, [{ itemId: "40", quantity: 1 }]);
    assert.equal(output.kind, "repeated");
    if (output.kind !== "repeated") return;
    assert.deepEqual(output.items[0], {
      kind: "none",
      ref: "1",
      note: '"Leche entera Sancor 1 l" ya no está disponible.',
    });
    assert.equal(output.items[1]?.kind, "picked");
    const [, fresh] = memory.current();
    assert.deepEqual(
      fresh?.items.map((item) => item.kind),
      ["none", "picked"],
    );
  });

  it("reports every product as not available when none is", async () => {
    const memory = memoryOrders([closed("order-1", [milk])]);
    const { store } = storeOf(catalog, ["20"]);
    const output = await repeatOrder({ orderId: "order-1" }, dependencies(memory, store), signal);
    assert.equal(output.kind, "repeated");
    if (output.kind !== "repeated") return;
    assert.deepEqual(
      output.items.map((item) => item.kind),
      ["none"],
    );
  });

  it("refuses an Order that is not among the last 3 closed ones", async () => {
    const memory = memoryOrders(
      ["1", "2", "3", "4"].map((number) => closed(`order-${number}`, [milk])),
    );
    const { store } = storeOf(catalog);
    assert.deepEqual(
      await repeatOrder({ orderId: "order-1" }, dependencies(memory, store), signal),
      { kind: "refused", reason: "unknown-order" },
    );
    assert.equal(memory.current().length, 4);
    assert.equal(
      (await repeatOrder({ orderId: "order-2" }, dependencies(memory, store), signal)).kind,
      "repeated",
    );
  });

  it("refuses while an Order is open, without a postal code, and when nothing was bought", async () => {
    const { store } = storeOf(catalog);
    const open: ChatOrder = { ...closed("order-2", []), status: "draft", cart: undefined };
    const withOpen = memoryOrders([closed("order-1", [milk]), open]);
    assert.deepEqual(
      await repeatOrder({ orderId: "order-1" }, dependencies(withOpen, store), signal),
      { kind: "refused", reason: "order-open" },
    );
    const plain = memoryOrders([closed("order-1", [milk])]);
    assert.deepEqual(
      await repeatOrder({ orderId: "order-1" }, dependencies(plain, store, null), signal),
      { kind: "refused", reason: "no-postal-code" },
    );
    const empty = memoryOrders([{ ...closed("order-1", []), cart: undefined }]);
    assert.deepEqual(
      await repeatOrder({ orderId: "order-1" }, dependencies(empty, store), signal),
      { kind: "refused", reason: "nothing-to-repeat" },
    );
    assert.equal(plain.current().length, 1);
  });
});
