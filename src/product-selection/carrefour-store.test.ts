import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createCarrefourStore, type HttpRequest } from "./carrefour-store.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

const recorded = (routes: [RegExp, string][]) => {
  const seen: HttpRequest[] = [];
  const http = (request: HttpRequest) => {
    seen.push(request);
    const route = routes.find(([pattern]) => pattern.test(request.url));
    if (!route) return Promise.reject(new Error(`no recorded response for ${request.url}`));
    return Promise.resolve(fixture(route[1]));
  };
  return { store: createCarrefourStore(http), seen };
};

const searchRoutes: [RegExp, string][] = [
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=1425$/, "regions"],
  [/\/facets\/trade-policy\/1\?/, "facets-query-gaseosa"],
  [/\/facets\/trade-policy\/1\/tipo-de-producto\/gaseosa\?/, "facets-tipo-gaseosa"],
  [
    /\/product-search\/trade-policy\/1\/tipo-de-producto\/gaseosa\/brand\/coca-cola\?/,
    "search-gaseosa-coca-cola",
  ],
];

describe("createCarrefourStore", () => {
  it("lists available products of a Tipo and brand in the postal code's region", async () => {
    const { store, seen } = recorded(searchRoutes);
    const candidates = await store.findCandidates({
      postalCode: "1425",
      tipos: ["Gaseosa"],
      brand: "Coca-Cola",
      sort: "discount:desc",
      limit: 2,
    });
    assert.deepEqual(candidates, [
      {
        productId: "393964",
        itemId: "11324",
        name: "Gaseosa cola Coca Cola Zero 2,25 lts",
        brand: "Coca Cola",
        measure: { dimension: "volume", amount: 2250 },
      },
      {
        productId: "30138",
        itemId: "3807",
        name: "Gaseosa cola Coca Cola sabor original 2,25 lts",
        brand: "Coca Cola",
        measure: { dimension: "volume", amount: 2250 },
      },
    ]);
    const search = new URL(seen.at(-1)!.url);
    assert.equal(
      search.searchParams.get("regionId"),
      (fixture("regions") as { id: string }[])[0]!.id,
    );
    assert.equal(search.searchParams.get("hideUnavailableItems"), "true");
    assert.equal(search.searchParams.get("sort"), "discount:desc");
    assert.equal(search.searchParams.get("count"), "2");
    assert.equal(search.searchParams.get("page"), "1");
  });

  it("finds nothing for a brand the Tipo does not carry or a Tipo search does not know", async () => {
    const { store } = recorded(searchRoutes);
    const query = { postalCode: "1425", sort: "discount:desc" as const, limit: 2 };
    assert.deepEqual(
      await store.findCandidates({ ...query, tipos: ["Gaseosa"], brand: "Marca Inventada" }),
      [],
    );
    assert.deepEqual(
      await store.findCandidates({ ...query, tipos: ["Tipo inventado"], brand: null }),
      [],
    );
  });

  it("simulates with all promotions, the postal code and seller 1, in pesos", async () => {
    const { store, seen } = recorded([[/orderForms\/simulation/, "simulation-promotion"]]);
    const simulation = await store.simulate("1425", [{ itemId: "3807", quantity: 2 }]);
    assert.deepEqual(simulation, {
      lines: [
        {
          itemId: "3807",
          quantity: 2,
          available: true,
          total: 9000,
          savings: 3000,
          promotions: [
            "PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10",
          ],
        },
      ],
      total: 9000,
    });
    assert.match(seen[0]!.url, /RnbBehavior=0/);
    assert.deepEqual(seen[0]!.body, {
      items: [{ id: "3807", quantity: 2, seller: "1" }],
      country: "ARG",
      postalCode: "1425",
    });
  });

  it("marks an item checkout cannot deliver as unavailable and leaves it out of the total", async () => {
    const { store } = recorded([[/orderForms\/simulation/, "simulation-unavailable"]]);
    const simulation = await store.simulate("1425", [{ itemId: "11187", quantity: 1 }]);
    assert.equal(simulation.lines[0]?.available, false);
    assert.equal(simulation.total, 0);
  });
});
