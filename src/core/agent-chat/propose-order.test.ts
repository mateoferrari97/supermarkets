import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { memoryOrders } from "./agent-chat-fixtures.ts";
import type { ChatOrder, OrderLine } from "./order.ts";
import { proposeOrder } from "./propose-order.ts";
import type { TurnOutcome } from "./tool.ts";

const line = (productId: string, total: number): OrderLine => ({
  description: `item ${productId}`,
  productId,
  itemId: `${productId}0`,
  name: `Producto ${productId}`,
  brand: null,
  quantity: 2,
  unitPrice: total / 2,
  total,
  reason: "Es el más barato.",
  notes: [],
});

const draft = (): ChatOrder => ({
  id: "order-1",
  status: "draft",
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [
    { kind: "picked", ref: "1", line: line("1", 1600) },
    { kind: "none", ref: "2", description: "bicicleta", note: 'No encontré "bicicleta".' },
    { kind: "picked", ref: "3", line: line("3", 900) },
  ],
  proposals: 0,
  proposal: null,
});

const outcome = (): TurnOutcome => ({ ended: null });

describe("proposeOrder", () => {
  it("records the proposal on the open Order and ends the turn with its card", async () => {
    const { orders, current } = memoryOrders([draft()]);
    const turn = outcome();
    const output = await proposeOrder({ refs: ["1", "2", "3"] }, { orders, outcome: turn });
    assert.deepEqual(output, { kind: "proposed", proposalId: "order-1-1" });
    const [order] = current();
    assert.equal(order?.status, "proposed");
    assert.equal(order?.proposals, 1);
    assert.deepEqual(order?.proposal, {
      id: "order-1-1",
      lines: [line("1", 1600), line("3", 900)],
      notes: ['No encontré "bicicleta".'],
      total: 2500,
    });
    assert.deepEqual(turn.ended?.parts, [{ type: "proposal", proposal: order?.proposal }]);
    assert.match(turn.ended?.text ?? "", /1\. Producto 1 × 2: \$1600\.00/);
    assert.match(turn.ended?.text ?? "", /Total: \$2500\.00/);
    assert.match(turn.ended?.text ?? "", /No encontré "bicicleta"/);
  });

  it("leaves out the Items whose ref is not given", async () => {
    const { orders, current } = memoryOrders([draft()]);
    await proposeOrder({ refs: ["3", "3"] }, { orders, outcome: outcome() });
    assert.deepEqual(current()[0]?.proposal?.lines, [line("3", 900)]);
    assert.deepEqual(current()[0]?.proposal?.notes, []);
  });

  it("numbers a second proposal on the same Order", async () => {
    const { orders, current } = memoryOrders([draft()]);
    await proposeOrder({ refs: ["1"] }, { orders, outcome: outcome() });
    const output = await proposeOrder({ refs: ["1", "3"] }, { orders, outcome: outcome() });
    assert.deepEqual(output, { kind: "proposed", proposalId: "order-1-2" });
    assert.equal(current()[0]?.proposals, 2);
  });

  it("refuses with no open Order, an unknown ref or nothing to buy, and saves nothing", async () => {
    const closed: ChatOrder = { ...draft(), status: "closed" };
    const none = memoryOrders([closed]);
    const turn = outcome();
    assert.deepEqual(await proposeOrder({ refs: ["1"] }, { orders: none.orders, outcome: turn }), {
      kind: "refused",
      reason: "no-open-order",
      ref: null,
    });
    const open = memoryOrders([draft()]);
    assert.deepEqual(
      await proposeOrder({ refs: ["1", "9"] }, { orders: open.orders, outcome: turn }),
      {
        kind: "refused",
        reason: "unknown-ref",
        ref: "9",
      },
    );
    assert.deepEqual(await proposeOrder({ refs: ["2"] }, { orders: open.orders, outcome: turn }), {
      kind: "refused",
      reason: "nothing-to-buy",
      ref: null,
    });
    assert.deepEqual(open.current(), [draft()]);
    assert.equal(turn.ended, null);
  });
});
