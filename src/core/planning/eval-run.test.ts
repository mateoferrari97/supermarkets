import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { planFirstMessage } from "./eval-run.ts";
import type { Plan, PlanInput, PlanOutput } from "./plan.ts";

const product = (productId: string, name: string, price: number): CatalogProduct => ({
  productId,
  itemId: productId,
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price,
  inStock: true,
  sale: { kind: "packaged", size: null },
  teasers: [],
});

const catalog = [product("p1", "Tapas para lasaña", 2000), product("p2", "Salsa de tomate", 1000)];

const search: CatalogSearch = {
  findMatches: (item) =>
    catalog.filter(({ name }) => name.toLowerCase().includes(item.product.toLowerCase())),
};

const planOf = (lines: [string, number][]): Plan => ({
  title: "Lasaña",
  idea: [{ heading: "Pasos", text: "Armá la lasaña" }],
  lines: lines.map(([productId, quantity]) => ({
    productId,
    quantity,
    purpose: "para la lasaña",
    reason: "común",
  })),
});

const planner = (outputs: PlanOutput[]) => {
  const inputs: PlanInput[] = [];
  return {
    inputs,
    plan: (input: PlanInput) => {
      inputs.push(input);
      return Promise.resolve(outputs.shift()!);
    },
  };
};

describe("planFirstMessage", () => {
  it("plans the first message with its searches and returns the Plan shown", async () => {
    const llm = planner([
      { kind: "search", queries: ["tapas", "salsa"] },
      {
        kind: "answer",
        message: "Te armé una lasaña.",
        plan: planOf([
          ["p1", 1],
          ["p2", 1],
          ["p2", 1],
        ]),
        budget: null,
      },
    ]);
    assert.deepEqual(await planFirstMessage("lasaña para 4", { llm, search }), {
      message: "Te armé una lasaña.",
      plan: {
        title: "Lasaña",
        idea: [{ heading: "Pasos", text: "Armá la lasaña" }],
        lines: [
          {
            productId: "p1",
            name: "Tapas para lasaña",
            sale: { kind: "packaged", size: null },
            quantity: 1,
            purpose: "para la lasaña",
            total: 2000,
          },
          {
            productId: "p2",
            name: "Salsa de tomate",
            sale: { kind: "packaged", size: null },
            quantity: 2,
            purpose: "para la lasaña",
            total: 2000,
          },
        ],
        total: 4000,
      },
      budget: null,
      overBudget: null,
      repeatedProductIds: ["p2"],
      searches: [["tapas", "salsa"]],
    });
    assert.deepEqual(llm.inputs[0]!.messages, [{ role: "owner", text: "lasaña para 4" }]);
  });

  it("returns the Plan of the budget retry and what it is still over", async () => {
    const llm = planner([
      { kind: "search", queries: ["tapas"] },
      { kind: "answer", message: "Primero", plan: planOf([["p1", 3]]), budget: 3000 },
      { kind: "answer", message: "Ajustado", plan: planOf([["p1", 2]]), budget: 3000 },
    ]);
    const run = await planFirstMessage("lasaña con $3000", { llm, search });
    assert.equal(run.message, "Ajustado");
    assert.equal(run.plan?.total, 4000);
    assert.equal(run.overBudget, 1000);
    assert.equal(run.budget, 3000);
    assert.deepEqual(run.repeatedProductIds, []);
  });

  it("returns advice with no Plan", async () => {
    const llm = planner([{ kind: "answer", message: "Un blanco.", plan: null, budget: null }]);
    assert.deepEqual(await planFirstMessage("¿qué vino va con pescado?", { llm, search }), {
      message: "Un blanco.",
      plan: null,
      budget: null,
      overBudget: null,
      repeatedProductIds: [],
      searches: [],
    });
  });

  it("fails when the first message is confirmed with no Plan shown", async () => {
    const llm = planner([{ kind: "confirm" }]);
    await assert.rejects(
      planFirstMessage("Confirmo", { llm, search }),
      /plan answer breaks a rule: a confirm with no Plan shown/,
    );
  });
});
