import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { stepsFrom } from "../order-conversation/steps.ts";
import type { Plan, PlanInput, PlanOutput } from "./plan.ts";
import { planWithinBudget } from "./plan-budget.ts";

const product = (productId: string, name: string, price: number): CatalogProduct => ({
  productId,
  itemId: productId.slice(1),
  name,
  brand: null,
  department: "Carnes",
  tipo: null,
  price,
  inStock: true,
  sale: { kind: "by-weight", saleStepKg: 0.5 },
  teasers: [],
});

const tenderloin = product("p1", "Vacío x kg", 20000);
const shortRibs = product("p2", "Asado de novillo x kg", 10000);
const sausage = product("p3", "Chorizo parrillero x kg", 8000);

const search: CatalogSearch = {
  findMatches: (item) =>
    [tenderloin, shortRibs, sausage].filter(({ name }) =>
      name.toLowerCase().includes(item.product.toLowerCase()),
    ),
};

const asadoOf = (lines: [string, number][]): Plan => ({
  title: "Asado para 10",
  idea: [{ heading: "Cantidades", text: "500 g de carne por persona." }],
  lines: lines.map(([productId, quantity]) => ({
    productId,
    quantity,
    purpose: "para el asado",
    reason: "Corte para la parrilla",
  })),
});

const answerOf = (plan: Plan | null, budget: number | null = 50000): PlanOutput => ({
  kind: "answer",
  message: "Te armé el asado.",
  plan,
  budget,
});

const start: PlanInput = {
  messages: [{ role: "owner", text: "un asado para 10 con unos $50.000" }],
  products: [tenderloin, shortRibs, sausage],
  lastPlan: null,
};

const run = (outputs: PlanOutput[]) => {
  const inputs: PlanInput[] = [];
  const pending = [...outputs];
  const llm = {
    plan: (input: PlanInput) => {
      inputs.push(input);
      return Promise.resolve(pending.shift() ?? answerOf(null));
    },
  };
  return { inputs, result: planWithinBudget(start, { llm, search }, stepsFrom({})) };
};

const linesOf = (output: {
  plan: { lines: { product: CatalogProduct; quantity: number }[] } | null;
}) => output.plan?.lines.map(({ product, quantity }) => [product.productId, quantity]);

describe("planWithinBudget", () => {
  it("shows a Plan that fits the budget after one call", async () => {
    const { result, inputs } = run([answerOf(asadoOf([["p2", 5000]]))]);
    const { output, overBudget } = await result;
    assert.equal(inputs.length, 1);
    assert.deepEqual(linesOf(output), [["p2", 5000]]);
    assert.equal(overBudget, null);
  });

  it("shows a Plan with no budget after one call", async () => {
    const { result, inputs } = run([answerOf(asadoOf([["p1", 5000]]), null)]);
    const { overBudget } = await result;
    assert.equal(inputs.length, 1);
    assert.equal(overBudget, null);
  });

  it("sends a Plan over the budget back once with its total and the budget", async () => {
    const { result, inputs } = run([
      answerOf(
        asadoOf([
          ["p1", 2400],
          ["p3", 1000],
        ]),
      ),
      answerOf(
        asadoOf([
          ["p2", 4000],
          ["p3", 1000],
        ]),
      ),
    ]);
    const { output, overBudget } = await result;
    assert.equal(inputs.length, 2);
    assert.deepEqual(inputs[1]!.messages, start.messages);
    assert.deepEqual(inputs[1]!.overBudget, { budget: 50000, total: 58000 });
    assert.deepEqual(
      inputs[1]!.lastPlan?.lines.map(({ productId, quantity }) => [productId, quantity]),
      [
        ["p1", 2500],
        ["p3", 1000],
      ],
    );
    assert.deepEqual(linesOf(output), [
      ["p2", 4000],
      ["p3", 1000],
    ]);
    assert.equal(overBudget, null);
  });

  it("shows a Plan still over the budget with how much it exceeds it", async () => {
    const { result, inputs } = run([
      answerOf(asadoOf([["p1", 3000]])),
      answerOf(
        asadoOf([
          ["p1", 2500],
          ["p3", 1000],
        ]),
      ),
    ]);
    const { output, overBudget } = await result;
    assert.equal(inputs.length, 2);
    assert.deepEqual(linesOf(output), [
      ["p1", 2500],
      ["p3", 1000],
    ]);
    assert.equal(overBudget, 8000);
  });

  it("lets the retry search for cheaper products", async () => {
    const { result } = run([
      answerOf(asadoOf([["p1", 3000]])),
      { kind: "search", queries: ["asado"] },
      answerOf(asadoOf([["p2", 5000]])),
    ]);
    const { output, overBudget } = await result;
    assert.deepEqual(linesOf(output), [["p2", 5000]]);
    assert.equal(overBudget, null);
  });

  it("keeps the first Plan and its excess when the retry gives no Plan", async () => {
    const { result } = run([answerOf(asadoOf([["p1", 3000]])), answerOf(null)]);
    const { output, overBudget } = await result;
    assert.deepEqual(linesOf(output), [["p1", 3000]]);
    assert.equal(output.message, "Te armé el asado.");
    assert.equal(overBudget, 10000);
  });
});
