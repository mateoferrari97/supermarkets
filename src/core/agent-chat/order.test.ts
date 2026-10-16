import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { product } from "./agent-chat-fixtures.ts";
import { chatMessageSchema } from "./chat.ts";
import {
  chatOrderSchema,
  lastClosedOrders,
  openOrder,
  openOrderOf,
  renderOrder,
  renderPastOrders,
  type ChatOrder,
  type OrderLine,
} from "./order.ts";

const line: OrderLine = {
  description: "leche",
  productId: "2",
  itemId: "20",
  name: "Leche entera Sancor 1 l",
  brand: "Sancor",
  quantity: 2,
  unitPrice: 800,
  total: 1600,
  reason: "Es el más barato.",
  notes: [],
};

const order = (id: string, status: ChatOrder["status"]): ChatOrder => ({
  id,
  status,
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [],
  proposals: 0,
  proposal: null,
});

describe("the open Order", () => {
  it("is the one that is not closed", () => {
    assert.equal(openOrderOf([order("order-1", "closed")]), null);
    assert.equal(
      openOrderOf([order("order-1", "closed"), order("order-2", "proposed")])?.id,
      "order-2",
    );
  });

  it("opens a new draft after the closed ones and reuses the open one", () => {
    const orders = [order("order-1", "closed")];
    const opened = openOrder(orders, new Date("2026-10-20T10:00:00.000Z"));
    assert.equal(opened.id, "order-2");
    assert.equal(opened.status, "draft");
    assert.equal(opened.openedAt, "2026-10-20T10:00:00.000Z");
    assert.equal(orders.length, 2);
    assert.equal(openOrder(orders, new Date()), opened);
    assert.equal(orders.length, 2);
  });
});

describe("renderOrder", () => {
  it("says there is no open Order", () => {
    assert.match(renderOrder(null), /There is no open Order/);
  });

  it("lists the Items by ref with the product code and the proposal", () => {
    const text = renderOrder({
      ...order("order-1", "proposed"),
      items: [
        { kind: "picked", ref: "1", line },
        { kind: "none", ref: "2", description: "bicicleta", note: "x" },
      ],
      proposals: 1,
      proposal: { id: "order-1-1", lines: [line], notes: [], total: 1600 },
    });
    assert.match(text, /status: proposed/);
    assert.match(
      text,
      /- ref 1: "leche" is product 2 "Leche entera Sancor 1 l", quantity 2, \$1600\.00/,
    );
    assert.match(text, /- ref 2: "bicicleta" was not found/);
    assert.match(text, /proposal order-1-1: 2/);
  });
});

describe("the schemas", () => {
  it("accept an Order and a message with a proposal and reject a bad status or a proposal with no lines", () => {
    const withProposal = {
      ...order("order-1", "proposed"),
      proposal: { id: "p", lines: [line], notes: [], total: 1600 },
    };
    assert.equal(chatOrderSchema.safeParse(withProposal).success, true);
    assert.equal(chatOrderSchema.safeParse({ ...withProposal, status: "open" }).success, false);
    assert.equal(
      chatOrderSchema.safeParse({
        ...withProposal,
        proposal: { id: "p", lines: [], notes: [], total: 0 },
      }).success,
      false,
    );
    const message = {
      role: "assistant",
      at: "2026-10-16T12:00:00.000Z",
      text: "Armé este pedido",
      parts: [{ type: "proposal", proposal: withProposal.proposal }],
    };
    assert.equal(chatMessageSchema.safeParse(message).success, true);
    assert.equal(
      chatMessageSchema.safeParse({ ...message, parts: [{ type: "cart" }] }).success,
      false,
    );
  });
});

describe("an Order that waits for the Owner's choice", () => {
  const waiting: ChatOrder = {
    ...order("order-1", "draft"),
    items: [
      {
        kind: "choose",
        ref: "1",
        description: "yogur",
        brand: null,
        size: "common",
        quantity: "minimum",
        alternatives: [product("11", "Yogur frutilla Ilolay", 500)],
        shown: ["11", "12"],
      },
    ],
  };

  it("is valid and says which products were offered and shown", () => {
    assert.ok(chatOrderSchema.safeParse(waiting).success);
    const text = renderOrder(waiting);
    assert.match(text, /ref 1: "yogur" has no product that fits/);
    assert.match(text, /11 "Yogur frutilla Ilolay" \$500\.00/);
    assert.match(text, /shown so far: 11, 12/);
  });
});

describe("the past Orders", () => {
  const withCart = (id: string, status: ChatOrder["status"]): ChatOrder => ({
    ...order(id, status),
    cart: {
      postalCode: "1425",
      lines: [line],
      notes: [],
      total: 1600,
      warning: "",
      cartLink: "https://example.test/cart",
    },
  });

  it("are the last 3 closed Orders and nothing older or still open", () => {
    const orders = [
      withCart("order-1", "closed"),
      withCart("order-2", "closed"),
      withCart("order-3", "closed"),
      withCart("order-4", "closed"),
      order("order-5", "proposed"),
    ];
    assert.deepEqual(
      lastClosedOrders(orders).map((each) => each.id),
      ["order-2", "order-3", "order-4"],
    );
    assert.deepEqual(lastClosedOrders([order("order-1", "draft")]), []);
  });

  it("render the Items and products bought with no prices", () => {
    const text = renderPastOrders([withCart("order-1", "closed")]);
    assert.match(text, /order order-1, opened 2026-10-16T12:00:00.000Z/);
    assert.match(text, /"leche": product 2 "Leche entera Sancor 1 l", quantity 2/);
    assert.doesNotMatch(text, /1600|800|\$/);
  });

  it("say there are none yet", () => {
    assert.match(renderPastOrders([]), /There are no closed Orders yet/);
  });
});
