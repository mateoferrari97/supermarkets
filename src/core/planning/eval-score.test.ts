import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { PlanCase, RouteCase } from "./eval-set.ts";
import {
  casePassed,
  scorePlanRun,
  scoreRoute,
  summarizePlanning,
  type PlanRun,
  type PlanRunLine,
} from "./eval-score.ts";

const line = (fields: Partial<PlanRunLine> = {}): PlanRunLine => ({
  productId: "1",
  name: "Asado de novillo x kg",
  sale: { kind: "by-weight", saleStepKg: 1.2 },
  quantity: 2400,
  purpose: "para el asado",
  total: 28800,
  ...fields,
});

const run = (fields: Partial<PlanRun> = {}): PlanRun => ({
  message: "Te armé un asado.",
  plan: {
    title: "Asado para 10",
    idea: [
      { heading: "Cantidades por persona", text: "400 g por persona" },
      { heading: "Pasos", text: "Prendé el fuego" },
    ],
    lines: [line()],
    total: 28800,
  },
  budget: 50000,
  overBudget: null,
  repeatedProductIds: [],
  searches: [["asado"]],
  ...fields,
});

const planCase = (fields: Partial<PlanCase> = {}): PlanCase => ({
  id: "asado",
  message: "un asado para 10 con unos $50.000",
  covers: ["event"],
  plan: true,
  ...fields,
});

const inStock = (productId: string) => productId !== "9";

describe("scorePlanRun", () => {
  it("passes a Plan that keeps every rule of its case", () => {
    assert.deepEqual(
      scorePlanRun(
        planCase({
          budget: 50000,
          quantities: [{ label: "carne", productIds: ["1", "2"], unit: "g", min: 2000, max: 5000 }],
          forbiddenWords: ["trigo"],
          idea: { headings: ["pasos"], min: 1 },
        }),
        run(),
        inStock,
      ),
      { passed: true, problems: [] },
    );
  });

  it("fails when a Plan is expected and none is shown", () => {
    assert.deepEqual(scorePlanRun(planCase(), run({ plan: null }), inStock), {
      passed: false,
      problems: ["no Plan shown"],
    });
  });

  it("fails when advice with no purchase shows a Plan", () => {
    assert.deepEqual(scorePlanRun(planCase({ plan: false }), run(), inStock), {
      passed: false,
      problems: ["a Plan shown when none was expected"],
    });
    assert.deepEqual(scorePlanRun(planCase({ plan: false }), run({ plan: null }), inStock), {
      passed: true,
      problems: [],
    });
  });

  it("fails a line out of stock in the Catalog Snapshot", () => {
    const outOfStock = run({ plan: { ...run().plan!, lines: [line({ productId: "9" })] } });
    assert.deepEqual(scorePlanRun(planCase(), outOfStock, inStock).problems, [
      'line "Asado de novillo x kg" (9) is not in stock in the Catalog Snapshot',
    ]);
  });

  it("fails a total over the budget", () => {
    assert.deepEqual(scorePlanRun(planCase({ budget: 20000 }), run(), inStock).problems, [
      "total $28800 is over the budget of $20000",
    ]);
  });

  it("sums the lines of a range in its unit", () => {
    const lines = [
      line(),
      line({ productId: "2", name: "Vacío x kg", quantity: 1000 }),
      line({
        productId: "3",
        name: "Chorizo Paladini 500 g",
        sale: { kind: "packaged", size: { dimension: "weight", amount: 500 } },
        quantity: 2,
      }),
      line({ productId: "4", name: "Carbón", sale: { kind: "packaged", size: null }, quantity: 1 }),
    ];
    const scored = (min: number, max: number) =>
      scorePlanRun(
        planCase({
          quantities: [{ label: "carne", productIds: ["1", "2", "3"], unit: "g", min, max }],
        }),
        run({ plan: { ...run().plan!, lines } }),
        inStock,
      ).problems;
    assert.deepEqual(scored(4400, 4400), []);
    assert.deepEqual(scored(4500, 5000), ["carne: 4400 g, expected 4500 to 5000 g"]);
    assert.deepEqual(scored(1000, 4000), ["carne: 4400 g, expected 1000 to 4000 g"]);
  });

  it("counts units and millilitres of packaged products", () => {
    const wine = line({
      productId: "5",
      name: "Vino tinto 750 ml",
      sale: { kind: "packaged", size: { dimension: "volume", amount: 750 } },
      quantity: 3,
    });
    const withWine = run({ plan: { ...run().plan!, lines: [wine] } });
    const range = (unit: "ml" | "unit", min: number, max: number) =>
      scorePlanRun(
        planCase({ quantities: [{ label: "vino", productIds: ["5"], unit, min, max }] }),
        withWine,
        inStock,
      ).problems;
    assert.deepEqual(range("ml", 2250, 2250), []);
    assert.deepEqual(range("unit", 3, 3), []);
  });

  it("fails a line of a range that cannot be measured in its unit", () => {
    assert.deepEqual(
      scorePlanRun(
        planCase({
          quantities: [{ label: "carne", productIds: ["1"], unit: "unit", min: 1, max: 9 }],
        }),
        run(),
        inStock,
      ).problems,
      [
        'carne: line "Asado de novillo x kg" (1) cannot be measured in unit',
        "carne: 0 unit, expected 1 to 9 unit",
      ],
    );
  });

  it("fails a forbidden product or word, unless an allowed word is in the name", () => {
    const lines = [
      line({ productId: "6", name: "Fideos spaghetti Matarazzo 500 g" }),
      line({ productId: "7", name: "Fideos spaghetti sin TACC 500 g" }),
      line({ productId: "8", name: "Salsa de tomate" }),
    ];
    assert.deepEqual(
      scorePlanRun(
        planCase({
          forbiddenProductIds: ["8"],
          forbiddenWords: ["fideos", "sal"],
          allowedWords: ["sin tacc"],
        }),
        run({ plan: { ...run().plan!, lines } }),
        inStock,
      ).problems,
      [
        'line "Fideos spaghetti Matarazzo 500 g" (6) has the forbidden word "fideos"',
        'line "Salsa de tomate" (8) is a forbidden product',
      ],
    );
  });

  it("fails a product the planner put on more than one line", () => {
    assert.deepEqual(
      scorePlanRun(planCase(), run({ repeatedProductIds: ["1"] }), inStock).problems,
      ["product 1 is on more than one line of the planner's Plan"],
    );
  });

  it("fails an Idea with too few sections of the right kind", () => {
    assert.deepEqual(
      scorePlanRun(planCase({ idea: { headings: ["lunes", "martes"], min: 2 } }), run(), inStock)
        .problems,
      ['Idea has 0 sections headed "lunes" or "martes", expected at least 2'],
    );
    assert.deepEqual(scorePlanRun(planCase({ idea: { min: 3 } }), run(), inStock).problems, [
      "Idea has 2 sections, expected at least 3",
    ]);
  });
});

describe("scoreRoute", () => {
  const routeCase: RouteCase = { id: "leche", message: "2 leches", topic: "order" };

  it("passes the expected Topic and fails any other", () => {
    assert.deepEqual(scoreRoute(routeCase, "order"), { passed: true, problems: [] });
    assert.deepEqual(scoreRoute(routeCase, "plan"), {
      passed: false,
      problems: ['Topic "plan", expected "order"'],
    });
  });
});

describe("casePassed", () => {
  it("passes a case only when every run passes with no error", () => {
    const passed = { error: null, score: { passed: true, problems: [] } };
    const failed = { error: null, score: { passed: false, problems: ["x"] } };
    assert.equal(casePassed([passed, passed]), true);
    assert.equal(casePassed([passed, failed]), false);
    assert.equal(casePassed([passed, { error: "boom" }]), false);
  });
});

describe("summarizePlanning", () => {
  it("counts cases passed, unexpected failures, errors and sensible Ideas", () => {
    assert.deepEqual(
      summarizePlanning(
        [
          { id: "a", expectedToFail: null, passed: true, runs: [{ error: null }] },
          { id: "b", expectedToFail: null, passed: false, runs: [{ error: "boom" }] },
        ],
        [
          {
            id: "c",
            expectedToFail: "reason",
            passed: false,
            runs: [
              { error: null, judgment: { sensible: true, reason: "ok" } },
              { error: null, judgment: { sensible: false, reason: "no" } },
              { error: null, judgment: null },
            ],
          },
        ],
      ),
      {
        routes: { hits: 1, total: 2 },
        plans: { hits: 0, total: 1 },
        unexpectedFailures: ["b"],
        errors: { hits: 1, total: 5 },
        sensibleIdeas: { hits: 1, total: 2 },
      },
    );
  });
});
