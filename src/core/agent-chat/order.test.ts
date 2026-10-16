import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { chatMessageSchema } from "./chat.ts";
import {
  chatOrderSchema,
  openOrder,
  openOrderOf,
  renderOrder,
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
