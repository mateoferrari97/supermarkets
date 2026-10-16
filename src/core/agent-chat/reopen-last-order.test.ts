import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { memoryOrders } from "./agent-chat-fixtures.ts";
import type { ChatOrder } from "./order.ts";
import { reopenLastOrder } from "./reopen-last-order.ts";

const order = (id: string, status: ChatOrder["status"]): ChatOrder => ({
  id,
  status,
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [],
  proposals: 1,
  proposal: null,
});

describe("reopenLastOrder", () => {
  it("reopens only the last closed Order", async () => {
    const memory = memoryOrders([order("order-1", "closed"), order("order-2", "closed")]);
    assert.deepEqual(await reopenLastOrder({ orders: memory.orders }), {
      kind: "reopened",
      orderId: "order-2",
    });
    const [first, second] = memory.current();
    assert.equal(first?.status, "closed");
    assert.equal(first?.reopened, undefined);
    assert.equal(second?.status, "proposed");
    assert.equal(second?.reopened, true);
  });

  it("refuses while an Order is open, since the last closed Order is no longer the last", async () => {
    const memory = memoryOrders([order("order-1", "closed"), order("order-2", "draft")]);
    assert.deepEqual(await reopenLastOrder({ orders: memory.orders }), {
      kind: "refused",
      reason: "order-open",
    });
    assert.equal(memory.current()[0]?.status, "closed");
  });

  it("refuses when there is no Order", async () => {
    const memory = memoryOrders();
    assert.deepEqual(await reopenLastOrder({ orders: memory.orders }), {
      kind: "refused",
      reason: "no-closed-order",
    });
  });
});
