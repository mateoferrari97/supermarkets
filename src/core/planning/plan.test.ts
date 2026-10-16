import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, Sale } from "../order-matching/catalog-product.ts";
import { checkPlan, overBudget, type Plan, type PlanLine, type PlanShown } from "./plan.ts";

const product = (
  productId: string,
  name: string,
  price: number | null,
  sale: Sale,
): CatalogProduct => ({
  productId,
  itemId: productId.slice(1),
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price,
  inStock: true,
  sale,
  teasers: [],
});

const pasta = product("p1", "Tapas para lasaña 500 g", 2500, {
  kind: "packaged",
  size: { dimension: "weight", amount: 500 },
});
const mince = product("p2", "Carne picada especial x kg", 9000, {
  kind: "by-weight",
  saleStepKg: 0.5,
});
const cheese = product("p3", "Queso mozzarella x kg", 12000, {
  kind: "by-weight",
  saleStepKg: 0.1,
});
const seen = [pasta, mince, cheese];

const line = (productId: string, quantity: number, purpose = "para la lasaña"): PlanLine => ({
  productId,
  quantity,
  purpose,
  reason: "Ingrediente de la receta",
});

const planOf = (lines: PlanLine[]): Plan => ({
  title: "Lasaña para 4",
  idea: [{ heading: "Pasos", text: "Armá capas de pasta, carne y queso." }],
  lines,
});

const input = (products: CatalogProduct[] = seen) => ({
  messages: [{ role: "owner" as const, text: "quiero hacer lasaña para 4" }],
  products,
  lastPlan: null,
});

const shownOf = (lines: PlanLine[], products: CatalogProduct[] = seen): PlanShown => {
  const output = checkPlan(input(products), {
    kind: "answer",
    message: "Acá va la lasaña.",
    plan: planOf(lines),
    budget: null,
  });
  if (output.kind !== "answer" || output.plan === null) throw new Error("no Plan");
  return output.plan;
};

const failure = (lines: PlanLine[]) => () => shownOf(lines);

describe("checkPlan", () => {
  it("shows each line with its product, quantity and snapshot price, and the total", () => {
    const shown = shownOf([line("p1", 2), line("p2", 1000)]);
    assert.equal(shown.title, "Lasaña para 4");
    assert.deepEqual(shown.idea, [
      { heading: "Pasos", text: "Armá capas de pasta, carne y queso." },
    ]);
    assert.deepEqual(
      shown.lines.map(({ product, quantity, purpose, notes, total }) => [
        product.productId,
        quantity,
        purpose,
        notes,
        total,
      ]),
      [
        ["p1", 2, "para la lasaña", [], 5000],
        ["p2", 1000, "para la lasaña", [], 9000],
      ],
    );
    assert.equal(shown.total, 14000);
  });

  it("rounds a by-weight quantity up to its Sale Step with the Note of a Candidate", () => {
    const shown = shownOf([line("p2", 600)]);
    assert.equal(shown.lines[0]!.quantity, 1000);
    assert.deepEqual(shown.lines[0]!.notes, [
      "Carne picada especial x kg se vende de a 500 g: llevo 1 kg",
    ]);
    assert.equal(shown.lines[0]!.total, 9000);
    assert.equal(shown.total, 9000);
  });

  it("keeps the rounded quantities in the Plan given back to the planner", () => {
    const shown = shownOf([line("p2", 600), line("p3", 250)]);
    assert.deepEqual(
      shown.plan.lines.map(({ productId, quantity }) => [productId, quantity]),
      [
        ["p2", 1000],
        ["p3", 300],
      ],
    );
  });

  it("merges lines with the same product into one with the summed quantity and the purposes joined", () => {
    const shown = shownOf([
      line("p2", 300, "para la lasaña"),
      line("p1", 1),
      line("p2", 400, "para las empanadas"),
      line("p2", 100, "para la lasaña"),
    ]);
    assert.deepEqual(
      shown.lines.map(({ product, quantity, purpose, total }) => [
        product.productId,
        quantity,
        purpose,
        total,
      ]),
      [
        ["p2", 1000, "para la lasaña, para las empanadas", 9000],
        ["p1", 1, "para la lasaña", 2500],
      ],
    );
    assert.equal(shown.total, 11500);
    assert.deepEqual(
      shown.plan.lines.map(({ productId, quantity, purpose }) => [productId, quantity, purpose]),
      [
        ["p2", 1000, "para la lasaña, para las empanadas"],
        ["p1", 1, "para la lasaña"],
      ],
    );
  });

  it("leaves a product with no snapshot price out of the total", () => {
    const unpriced = product("p4", "Salsa de tomate 520 g", null, {
      kind: "packaged",
      size: null,
    });
    const shown = shownOf([line("p1", 1), line("p4", 1)], [...seen, unpriced]);
    assert.deepEqual(
      shown.lines.map(({ total }) => total),
      [2500, null],
    );
    assert.equal(shown.total, 2500);
  });

  it("rejects a product no search of this conversation returned", () => {
    assert.throws(failure([line("p9", 1)]), {
      message:
        "plan answer breaks a rule: product p9 was not returned by a search of this conversation",
    });
  });

  it("rejects a quantity that is not positive", () => {
    assert.throws(failure([line("p1", 0)]), {
      message: "plan answer breaks a rule: quantity 0 of product p1 is not positive",
    });
  });

  it("rejects a packaged product's quantity that is not a whole number of units", () => {
    assert.throws(failure([line("p1", 1.5)]), {
      message:
        "plan answer breaks a rule: quantity 1.5 of packaged product p1 is not a whole number of units",
    });
  });

  it("rejects a by-weight product's quantity that is not in whole grams", () => {
    assert.throws(failure([line("p2", 0.5)]), {
      message:
        "plan answer breaks a rule: quantity 0.5 of by-weight product p2 is not in whole grams",
    });
  });

  it("keeps an answer with no Plan as its message", () => {
    assert.deepEqual(
      checkPlan(input(), {
        kind: "answer",
        message: "¿Con carne o verdura?",
        plan: null,
        budget: null,
      }),
      { kind: "answer", message: "¿Con carne o verdura?", plan: null, budget: null },
    );
  });

  it("keeps the Owner's budget of an answer", () => {
    const output = checkPlan(input(), {
      kind: "answer",
      message: "Un asado para 10.",
      plan: planOf([line("p1", 1)]),
      budget: 50000,
    });
    assert.equal(output.kind === "answer" && output.budget, 50000);
  });

  it("rejects a budget that is not positive", () => {
    assert.throws(
      () =>
        checkPlan(input(), {
          kind: "answer",
          message: "Un asado para 10.",
          plan: null,
          budget: 0,
        }),
      { message: "plan answer breaks a rule: budget 0 is not positive" },
    );
  });

  it("keeps a search of up to 8 queries", () => {
    const queries = ["tapas lasaña", "carne picada", "mozzarella"];
    assert.deepEqual(checkPlan(input(), { kind: "search", queries }), { kind: "search", queries });
  });

  it("rejects a search of more than 8 queries", () => {
    const queries = Array.from({ length: 9 }, (_, index) => `producto ${String(index)}`);
    assert.throws(() => checkPlan(input(), { kind: "search", queries }), {
      message: "plan answer breaks a rule: 9 queries, more than 8",
    });
  });

  it("keeps a confirm once a Plan was shown", () => {
    const shown = { ...input(), lastPlan: planOf([line("p1", 1)]) };
    assert.deepEqual(checkPlan(shown, { kind: "confirm" }), { kind: "confirm" });
  });

  it("rejects a confirm when no Plan was shown", () => {
    assert.throws(() => checkPlan(input(), { kind: "confirm" }), {
      message: "plan answer breaks a rule: a confirm with no Plan shown",
    });
  });

  it("rejects a Plan with more than 60 lines", () => {
    assert.throws(failure(Array.from({ length: 61 }, () => line("p1", 1))), {
      message: "plan answer breaks a rule: 61 lines, more than 60",
    });
  });
});

describe("overBudget", () => {
  const shown = shownOf([line("p1", 2), line("p2", 1000)]);

  it("is how much the Plan's total exceeds the budget", () => {
    assert.equal(overBudget(shown, 12000), 2000);
  });

  it("is null when the total fits the budget", () => {
    assert.equal(overBudget(shown, 14000), null);
    assert.equal(overBudget(shown, 20000), null);
  });

  it("is null when the Owner gave no budget", () => {
    assert.equal(overBudget(shown, null), null);
  });
});
