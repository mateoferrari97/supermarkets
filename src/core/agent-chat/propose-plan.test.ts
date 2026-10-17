import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { memoryOrders, product } from "./agent-chat-fixtures.ts";
import type { ChatOrder } from "./order.ts";
import { newPlanTurn } from "./plan-turn.ts";
import { proposePlan, proposePlanInput } from "./propose-plan.ts";
import type { TurnOutcome } from "./tool.ts";

const pasta = product("11", "Tapas para lasaña 500 g", 2500, {
  sale: { kind: "packaged", size: { dimension: "weight", amount: 500 } },
});
const meat = product("12", "Carne picada especial x kg", 9000, {
  sale: { kind: "by-weight", saleStepKg: 0.5 },
});
const book = product("13", "Libro de recetas", 12999, {
  department: "Juguetería y Librería",
  sale: { kind: "packaged", size: null },
});
const unpriced = product("14", "Producto sin precio", 0, { price: null });

const searched = (overrides: Partial<ChatOrder> = {}): ChatOrder => ({
  id: "order-1",
  status: "draft",
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [],
  proposals: 0,
  proposal: null,
  seen: [pasta, meat, book, unpriced],
  ...overrides,
});

const idea = [{ heading: "Pasos", text: "Armá las capas." }];

const input = (overrides: Record<string, unknown> = {}) =>
  proposePlanInput.parse({
    title: "Lasaña para 4",
    idea,
    lines: [
      { productId: "11", quantity: 1, purpose: "para la lasaña", reason: "Tapas listas" },
      { productId: "12", quantity: 600, purpose: "para la salsa", reason: "Carne común" },
    ],
    ...overrides,
  });

const outcome = (): TurnOutcome => ({ ended: null });

function run(
  order: ChatOrder | null,
  overrides: Record<string, unknown> = {},
  turn = newPlanTurn(),
) {
  const memory = memoryOrders(order === null ? [] : [order]);
  const ended = outcome();
  const result = proposePlan(input(overrides), { orders: memory.orders, outcome: ended, turn });
  return { result, memory, ended, turn };
}

describe("proposePlan", () => {
  it("records the Plan as the proposal with its Idea and ends the turn with its card", async () => {
    const { result, memory, ended } = run(searched());
    assert.deepEqual(await result, {
      kind: "proposed",
      proposalId: "order-1-1",
      total: 11500,
      overBudget: null,
    });
    const [order] = memory.current();
    assert.equal(order?.status, "proposed");
    assert.equal(order?.proposals, 1);
    assert.deepEqual(order?.proposal?.idea, { title: "Lasaña para 4", sections: idea });
    assert.deepEqual(order?.proposal?.lines, [
      {
        description: "para la lasaña",
        productId: "11",
        itemId: "110",
        name: "Tapas para lasaña 500 g",
        brand: null,
        quantity: 1,
        unitPrice: 2500,
        total: 2500,
        reason: "Tapas listas",
        notes: [],
      },
      {
        description: "para la salsa",
        productId: "12",
        itemId: "120",
        name: "Carne picada especial x kg",
        brand: null,
        quantity: 2,
        unitPrice: 4500,
        total: 9000,
        reason: "Carne común",
        notes: ["Carne picada especial x kg se vende de a 500 g: llevo 1 kg"],
      },
    ]);
    assert.deepEqual(ended.ended?.parts, [{ type: "proposal", proposal: order?.proposal }]);
    assert.match(
      ended.ended?.text ?? "",
      /^Lasaña para 4\nPasos: Armá las capas\.\nArmé este plan:/,
    );
    assert.match(ended.ended?.text ?? "", /Total: \$11500\.00/);
  });

  it("merges lines of the same product into one with the summed quantity and joined purposes", async () => {
    const { result, memory } = run(searched(), {
      lines: [
        { productId: "11", quantity: 1, purpose: "para el lunes", reason: "Tapas" },
        { productId: "12", quantity: 500, purpose: "para el martes", reason: "Carne" },
        { productId: "11", quantity: 2, purpose: "para el jueves", reason: "Tapas" },
      ],
    });
    assert.equal((await result).kind, "proposed");
    const lines = memory.current()[0]?.proposal?.lines;
    assert.equal(lines?.length, 2);
    assert.equal(lines?.[0]?.quantity, 3);
    assert.equal(lines?.[0]?.description, "para el lunes, para el jueves");
    assert.equal(lines?.[0]?.total, 7500);
  });

  it("rounds a by-weight quantity up to its Sale Step with the same Note a Candidate gets", async () => {
    const { result, memory } = run(searched(), {
      lines: [{ productId: "12", quantity: 600, purpose: "para la salsa", reason: "Carne" }],
    });
    await result;
    const [line] = memory.current()[0]?.proposal?.lines ?? [];
    assert.equal(line?.quantity, 2);
    assert.deepEqual(line?.notes, ["Carne picada especial x kg se vende de a 500 g: llevo 1 kg"]);
  });

  it("refuses a product no search of the Order returned and saves nothing", async () => {
    const { result, memory, ended } = run(searched(), {
      lines: [{ productId: "99", quantity: 1, purpose: "x", reason: "y" }],
    });
    assert.deepEqual(await result, {
      kind: "refused",
      reason: "breaks-a-rule",
      detail:
        "plan answer breaks a rule: product 99 was not returned by a search of this conversation",
    });
    assert.deepEqual(memory.current(), [searched()]);
    assert.equal(ended.ended, null);
  });

  it("refuses a quantity that is not positive", async () => {
    for (const quantity of [0, -2]) {
      const { result } = run(searched(), {
        lines: [{ productId: "11", quantity, purpose: "x", reason: "y" }],
      });
      const output = await result;
      assert.equal(output.kind, "refused");
      assert.match((output as { detail: string }).detail, /is not positive/);
    }
  });

  it("refuses a fraction of a packaged product and a fraction of a gram", async () => {
    const packaged = await run(searched(), {
      lines: [{ productId: "11", quantity: 1.5, purpose: "x", reason: "y" }],
    }).result;
    assert.match(
      (packaged as { detail: string }).detail,
      /quantity 1\.5 of packaged product 11 is not a whole number of units/,
    );
    const weight = await run(searched(), {
      lines: [{ productId: "12", quantity: 250.5, purpose: "x", reason: "y" }],
    }).result;
    assert.match(
      (weight as { detail: string }).detail,
      /quantity 250\.5 of by-weight product 12 is not in whole grams/,
    );
  });

  it("refuses more than 60 lines", async () => {
    const many = Array.from({ length: 61 }, () => ({
      productId: "11",
      quantity: 1,
      purpose: "x",
      reason: "y",
    }));
    const output = await run(searched(), { lines: many }).result;
    assert.match((output as { detail: string }).detail, /61 lines, more than 60/);
  });

  it("refuses a budget that is not positive", async () => {
    const output = await run(searched(), { budget: 0 }).result;
    assert.match((output as { detail: string }).detail, /budget 0 is not positive/);
  });

  it("refuses a product with no price", async () => {
    const output = await run(searched(), {
      lines: [{ productId: "14", quantity: 1, purpose: "x", reason: "y" }],
    }).result;
    assert.deepEqual(output, {
      kind: "refused",
      reason: "no-price",
      detail: "Producto sin precio has no price in the catalog.",
    });
  });

  it("refuses with no open Order or nothing searched", async () => {
    for (const order of [null, searched({ status: "closed" }), searched({ seen: [] })]) {
      const { result, ended } = run(order);
      const output = await result;
      assert.equal(output.kind, "refused");
      assert.equal((output as { reason: string }).reason, "no-open-order");
      assert.equal(ended.ended, null);
    }
  });

  it("sends a Plan over the budget back once, then shows the revised Plan with how much it is over", async () => {
    const turn = newPlanTurn();
    const memory = memoryOrders([searched()]);
    const first = outcome();
    const sentBack = await proposePlan(input({ budget: 11000 }), {
      orders: memory.orders,
      outcome: first,
      turn,
    });
    assert.equal(sentBack.kind, "refused");
    assert.equal((sentBack as { reason: string }).reason, "over-budget");
    assert.match((sentBack as { detail: string }).detail, /\$11500\.00.*\$11000\.00.*\$500\.00/);
    assert.deepEqual(memory.current(), [searched()]);
    assert.equal(first.ended, null);
    const second = outcome();
    const shown = await proposePlan(input({ budget: 11000 }), {
      orders: memory.orders,
      outcome: second,
      turn,
    });
    assert.deepEqual(shown, {
      kind: "proposed",
      proposalId: "order-1-1",
      total: 11500,
      overBudget: 500,
    });
    assert.deepEqual(memory.current()[0]?.proposal?.overBudget, {
      budget: 11000,
      total: 11500,
      over: 500,
    });
    assert.match(second.ended?.text ?? "", /Este plan se pasa de tu presupuesto por \$500\.00\./);
  });

  it("shows a Plan within the budget with no remark", async () => {
    const { result, memory } = run(searched(), { budget: 11500 });
    assert.equal((await result).kind, "proposed");
    assert.equal(memory.current()[0]?.proposal?.overBudget, undefined);
  });

  it("keeps the notes the agent passes on the proposal", async () => {
    const { result, memory } = run(searched(), { notes: ["No encontré pimienta."] });
    await result;
    assert.deepEqual(memory.current()[0]?.proposal?.notes, ["No encontré pimienta."]);
  });

  it("numbers a revised Plan as the next proposal of the Order", async () => {
    const memory = memoryOrders([searched()]);
    const turn = newPlanTurn();
    await proposePlan(input(), { orders: memory.orders, outcome: outcome(), turn });
    const revised = await proposePlan(input({ title: "Lasaña para 6" }), {
      orders: memory.orders,
      outcome: outcome(),
      turn,
    });
    assert.deepEqual((revised as { proposalId: string }).proposalId, "order-1-2");
    assert.equal(memory.current()[0]?.proposal?.idea?.title, "Lasaña para 6");
  });

  it("does not end the turn on a reopened Order, so buildCart can follow", async () => {
    const { result, ended } = run(searched({ status: "proposed", reopened: true }));
    assert.equal((await result).kind, "proposed");
    assert.equal(ended.ended, null);
  });
});
