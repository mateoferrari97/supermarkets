import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch, SearchItem, SearchScope } from "../order-matching/catalog-search.ts";
import { stepsFrom, type StepEvent } from "../order-conversation/steps.ts";
import type { PlanInput, PlanOutput } from "./plan.ts";
import { planWithSearches } from "./plan-searches.ts";

const product = (productId: string, name: string): CatalogProduct => ({
  productId,
  itemId: productId.slice(1),
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price: 1000,
  inStock: true,
  sale: { kind: "packaged", size: null },
  teasers: [],
});

const catalog = [
  product("p1", "Tapas para lasaña"),
  product("p2", "Salsa de tomate"),
  product("p3", "Queso mozzarella"),
  ...Array.from({ length: 30 }, (_, index) => product(`q${String(index)}`, "Queso rallado")),
];

const searched: { item: SearchItem; scope: SearchScope; limit: number | undefined }[] = [];

const search: CatalogSearch = {
  findMatches: (item, scope, limit) => {
    searched.push({ item, scope, limit });
    const words = item.product.toLowerCase().split(" ");
    return catalog
      .filter(({ name }) => words.some((word) => name.toLowerCase().includes(word)))
      .slice(0, limit);
  },
};

const answer: PlanOutput = { kind: "answer", message: "¿Para cuántos?", plan: null };

const planner = (outputs: PlanOutput[]) => {
  const inputs: PlanInput[] = [];
  const pending = [...outputs];
  return {
    inputs,
    llm: {
      plan: (input: PlanInput) => {
        inputs.push(input);
        return Promise.resolve(pending.shift() ?? answer);
      },
    },
  };
};

const start: PlanInput = {
  messages: [{ role: "owner", text: "quiero hacer lasaña para 4" }],
  products: [],
  lastPlan: null,
};

const run = (outputs: PlanOutput[], signal?: AbortSignal) => {
  const fake = planner(outputs);
  const events: StepEvent[] = [];
  searched.length = 0;
  const result = planWithSearches(
    start,
    { llm: fake.llm, search },
    stepsFrom({ signal, onStep: (event) => events.push(event) }),
  );
  return { ...fake, events, result };
};

const ids = (products: CatalogProduct[]) => products.map(({ productId }) => productId);

describe("planWithSearches", () => {
  it("answers without searching when the planner answers first", async () => {
    const { result, inputs } = run([answer]);
    const { output, products } = await result;
    assert.deepEqual(output, answer);
    assert.deepEqual(products, []);
    assert.equal(inputs.length, 1);
  });

  it("runs each query in the plan scope for 20 Matches and gives the results to the next call", async () => {
    const { result, inputs } = run([{ kind: "search", queries: ["lasaña", "tomate"] }, answer]);
    const { products } = await result;
    assert.deepEqual(
      searched.map(({ item, scope, limit }) => [item.product, item.brand, scope, limit]),
      [
        ["lasaña", null, "plan", 20],
        ["tomate", null, "plan", 20],
      ],
    );
    assert.deepEqual(ids(inputs[1]!.products), ["p1", "p2"]);
    assert.deepEqual(inputs[1]!.messages, start.messages);
    assert.deepEqual(ids(products), ["p1", "p2"]);
  });

  it("keeps each product seen once across rounds, up to 20 Matches per query", async () => {
    const { result } = run([
      { kind: "search", queries: ["queso"] },
      { kind: "search", queries: ["mozzarella"] },
      answer,
    ]);
    const { products } = await result;
    assert.equal(products.length, 20);
    assert.deepEqual(ids(products).slice(0, 2), ["p3", "q0"]);
  });

  it("allows up to 3 search rounds in one turn", async () => {
    const { result, inputs } = run([
      { kind: "search", queries: ["lasaña"] },
      { kind: "search", queries: ["tomate"] },
      { kind: "search", queries: ["mozzarella"] },
      answer,
    ]);
    const { output } = await result;
    assert.deepEqual(output, answer);
    assert.equal(inputs.length, 4);
  });

  it("fails the turn on a fourth search", async () => {
    const { result } = run([
      { kind: "search", queries: ["lasaña"] },
      { kind: "search", queries: ["tomate"] },
      { kind: "search", queries: ["mozzarella"] },
      { kind: "search", queries: ["queso"] },
    ]);
    await assert.rejects(result, {
      message: "plan answer breaks a rule: a fourth search in one turn, more than 3",
    });
  });

  it("checks every answer of the planner", async () => {
    const { result } = run([
      {
        kind: "answer",
        message: "Acá va.",
        plan: {
          title: "Lasaña",
          idea: [],
          lines: [{ productId: "p1", quantity: 1, purpose: "para la lasaña", reason: "pasta" }],
        },
      },
    ]);
    await assert.rejects(result, {
      message:
        "plan answer breaks a rule: product p1 was not returned by a search of this conversation",
    });
  });

  it("reports one planning step per call and one search step per round", async () => {
    const { result, events } = run([{ kind: "search", queries: ["lasaña", "tomate"] }, answer]);
    await result;
    assert.deepEqual(
      events.filter(({ status }) => status === "started").map(({ step }) => step),
      [{ kind: "plan" }, { kind: "search", queries: ["lasaña", "tomate"] }, { kind: "plan" }],
    );
  });

  it("stops when the turn is aborted", async () => {
    const controller = new AbortController();
    const fake = planner([]);
    const llm = {
      plan: async (input: PlanInput): Promise<PlanOutput> => {
        controller.abort(new Error("closed"));
        await fake.llm.plan(input);
        return { kind: "search", queries: ["lasaña"] };
      },
    };
    searched.length = 0;
    await assert.rejects(
      planWithSearches(start, { llm, search }, stepsFrom({ signal: controller.signal })),
      { message: "closed" },
    );
    assert.deepEqual(searched, []);
  });
});
