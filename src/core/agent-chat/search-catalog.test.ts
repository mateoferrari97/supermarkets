import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { memoryOrders, product, searchOf } from "./agent-chat-fixtures.ts";
import { newPlanTurn } from "./plan-turn.ts";
import { searchCatalog, type SearchCatalogDependencies } from "./search-catalog.ts";

const pasta = product("11", "Tapas para lasaña La Salteña 500 g", 2500, {
  brand: "La Salteña",
  department: "Almacén",
  tipo: "Pastas frescas",
  sale: { kind: "packaged", size: { dimension: "weight", amount: 500 } },
});
const meat = product("12", "Carne picada especial x kg", 9000, {
  department: "Carnes",
  tipo: "Carne picada",
  sale: { kind: "by-weight", saleStepKg: 0.5 },
});
const book = product("13", "Libro de recetas Doña Petrona", 12999, {
  department: "Juguetería y Librería",
  sale: { kind: "packaged", size: null },
});

function dependencies(overrides: Partial<SearchCatalogDependencies> = {}) {
  const memory = memoryOrders();
  const { search, searched } = searchOf([pasta, meat, book]);
  const scopes: string[] = [];
  const limits: (number | undefined)[] = [];
  const dependencies: SearchCatalogDependencies = {
    search: {
      findMatches: (item, scope, limit) => {
        scopes.push(scope);
        limits.push(limit);
        return search.findMatches(item, scope, limit);
      },
    },
    orders: memory.orders,
    loadProfile: () => ({ postalCode: "1425" }),
    now: () => new Date("2026-10-16T12:00:00.000Z"),
    turn: newPlanTurn(),
    ...overrides,
  };
  return { dependencies, memory, searched, scopes, limits };
}

describe("searchCatalog", () => {
  it("searches the plan scope for 20 matches per query and answers one row per product", async () => {
    const { dependencies: deps, scopes, limits, searched } = dependencies();
    const output = await searchCatalog({ queries: ["tapas lasaña", "carne picada"] }, deps);
    assert.deepEqual(searched, ["tapas lasaña", "carne picada"]);
    assert.deepEqual(scopes, ["plan", "plan"]);
    assert.deepEqual(limits, [20, 20]);
    assert.deepEqual(output, {
      kind: "found",
      results: [
        {
          query: "tapas lasaña",
          found: 1,
          products: [
            "11 | Tapas para lasaña La Salteña 500 g | La Salteña | Almacén | Pastas frescas | $2500.00 | packaged, 500 g",
          ],
        },
        {
          query: "carne picada",
          found: 1,
          products: [
            "12 | Carne picada especial x kg | no brand | Carnes | Carne picada | $9000.00 per kg | by weight, Sale Step 500 g",
          ],
        },
      ],
    });
  });

  it("keeps every product found, once, as the products seen by the open Order", async () => {
    const { dependencies: deps, memory } = dependencies();
    await searchCatalog({ queries: ["tapas lasaña", "carne picada"] }, deps);
    await searchCatalog({ queries: ["tapas lasaña", "libro de recetas"] }, deps);
    const [order] = memory.current();
    assert.equal(memory.current().length, 1);
    assert.equal(order?.status, "draft");
    assert.deepEqual(
      order?.seen?.map((each) => each.productId),
      ["11", "12", "13"],
    );
  });

  it("reaches departments the order scope leaves out", async () => {
    const { dependencies: deps } = dependencies();
    const output = await searchCatalog({ queries: ["libro de recetas"] }, deps);
    assert.deepEqual(output, {
      kind: "found",
      results: [
        {
          query: "libro de recetas",
          found: 1,
          products: [
            "13 | Libro de recetas Doña Petrona | no brand | Juguetería y Librería | no type | $12999.00 | packaged, size unknown",
          ],
        },
      ],
    });
  });

  it("refuses more than 8 queries and a fourth search in a turn, and saves nothing", async () => {
    const { dependencies: deps, memory } = dependencies();
    const nine = Array.from({ length: 9 }, (_, index) => `producto ${String(index)}`);
    assert.deepEqual(await searchCatalog({ queries: nine }, deps), {
      kind: "refused",
      reason: "too-many-queries",
    });
    assert.deepEqual(memory.current(), []);
    for (const query of ["a", "b", "c"]) {
      assert.equal((await searchCatalog({ queries: [query] }, deps)).kind, "found");
    }
    assert.deepEqual(await searchCatalog({ queries: ["d"] }, deps), {
      kind: "refused",
      reason: "too-many-searches",
    });
  });

  it("counts the searches of each turn apart", async () => {
    const first = dependencies();
    for (const query of ["a", "b", "c"])
      await searchCatalog({ queries: [query] }, first.dependencies);
    const next = dependencies({ turn: newPlanTurn() });
    assert.equal((await searchCatalog({ queries: ["a"] }, next.dependencies)).kind, "found");
  });

  it("refuses without a postal code and saves nothing", async () => {
    const { dependencies: deps, memory, searched } = dependencies({ loadProfile: () => null });
    assert.deepEqual(await searchCatalog({ queries: ["leche"] }, deps), {
      kind: "refused",
      reason: "no-postal-code",
    });
    assert.deepEqual(searched, []);
    assert.deepEqual(memory.current(), []);
  });
});
