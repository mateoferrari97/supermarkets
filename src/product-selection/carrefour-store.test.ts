import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createCarrefourStore, snapshotProducts, type HttpRequest } from "./carrefour-store.ts";

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
  [
    /\/product-search\/trade-policy\/1\/tipo-de-producto\/gaseosa\/brand\/coca-cola\/brand\/pepsi\?/,
    "search-gaseosa-coca-cola-pepsi",
  ],
];

const cardTeaser = { name: "Tarjeta Carrefour 15%", minimumQuantity: 0 };

describe("createCarrefourStore", () => {
  it("lists available products of a Tipo and brand in the postal code's region", async () => {
    const { store, seen } = recorded(searchRoutes);
    const candidates = await store.findCandidates({
      postalCode: "1425",
      tipos: ["Gaseosa"],
      brands: ["Coca-Cola"],
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
        weightStepKg: null,
        teasers: [cardTeaser],
      },
      {
        productId: "30138",
        itemId: "3807",
        name: "Gaseosa cola Coca Cola sabor original 2,25 lts",
        brand: "Coca Cola",
        measure: { dimension: "volume", amount: 2250 },
        weightStepKg: null,
        teasers: [
          cardTeaser,
          {
            name: "PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10",
            minimumQuantity: 2,
          },
        ],
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
      await store.findCandidates({ ...query, tipos: ["Gaseosa"], brands: ["Marca Inventada"] }),
      [],
    );
    assert.deepEqual(
      await store.findCandidates({ ...query, tipos: ["Tipo inventado"], brands: [] }),
      [],
    );
  });

  it("lists products of any of several brands in one search", async () => {
    const { store, seen } = recorded(searchRoutes);
    const candidates = await store.findCandidates({
      postalCode: "1425",
      tipos: ["Gaseosa"],
      brands: ["Coca-Cola", "Pepsi", "Marca Inventada"],
      sort: "price:asc",
      limit: 3,
    });
    assert.deepEqual(
      candidates.map(({ brand }) => brand),
      ["Coca Cola", "Pepsi", "Pepsi"],
    );
    assert.equal(new URL(seen.at(-1)!.url).searchParams.get("sort"), "price:asc");
  });

  it("reads the weight step of a product sold by weight", async () => {
    const { store } = recorded([
      [/\/checkout\/pub\/regions\?/, "regions"],
      [/\/facets\/trade-policy\/1\?/, "facets-query-banana"],
      [/\/product-search\/trade-policy\/1\/tipo-de-producto\/banana\?/, "search-banana"],
    ]);
    const [banana] = await store.findCandidates({
      postalCode: "1425",
      tipos: ["Banana"],
      brands: [],
      sort: "discount:desc",
      limit: 2,
    });
    assert.deepEqual(banana, {
      productId: "719074",
      itemId: "185818",
      name: "Banana selección x kg.",
      brand: "Genérico",
      measure: { dimension: "weight", amount: 500 },
      weightStepKg: 0.5,
      teasers: [cardTeaser],
    });
  });

  it("fails when Carrefour answers with an error", async () => {
    const store = createCarrefourStore(() =>
      Promise.reject(new Error("Carrefour GET answered 503")),
    );
    await assert.rejects(
      store.simulate({ postalCode: "1425", card: null, items: [{ itemId: "3807", quantity: 1 }] }),
      /503/,
    );
  });

  it("simulates with all promotions, the postal code and seller 1, in pesos", async () => {
    const { store, seen } = recorded([[/orderForms\/simulation/, "simulation-promotion"]]);
    const simulation = await store.simulate({
      postalCode: "1425",
      card: null,
      items: [{ itemId: "3807", quantity: 2 }],
    });
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

  it("simulates with the Payment Card's payment system and BIN so its promotions apply", async () => {
    const { store, seen } = recorded([[/orderForms\/simulation/, "simulation-card"]]);
    const simulation = await store.simulate({
      postalCode: "1425",
      card: { paymentSystem: "502", bin: "507858" },
      items: [{ itemId: "3807", quantity: 2 }],
    });
    assert.deepEqual(simulation.lines[0]?.promotions, [
      "2do al 70% Tarjeta Carrefour o Cuenta digital Max 48 Combinable 9 al 15.10 COCA COLA",
    ]);
    assert.equal(simulation.total, 7800);
    assert.deepEqual((seen[0]!.body as { paymentData: unknown }).paymentData, {
      payments: [
        { paymentSystem: "502", bin: "507858", installments: 1, value: 0, referenceValue: 0 },
      ],
    });
  });

  it("marks an item checkout cannot deliver as unavailable and leaves it out of the total", async () => {
    const { store } = recorded([[/orderForms\/simulation/, "simulation-unavailable"]]);
    const simulation = await store.simulate({
      postalCode: "1425",
      card: null,
      items: [{ itemId: "11187", quantity: 1 }],
    });
    assert.equal(simulation.lines[0]?.available, false);
    assert.equal(simulation.total, 0);
  });

  it("turns Catalog Snapshot products into products to simulate, skipping those with no Tipo", () => {
    const record = {
      productId: "108211",
      skuIds: ["7870"],
      name: "Banana elegida x kg.",
      brand: "Genérico",
      tipo: "Banana",
      measureUnit: "GRM",
      consumptionQuantity: "1000.00",
    };
    assert.deepEqual(snapshotProducts([record, { ...record, tipo: null }]), [
      {
        productId: "108211",
        itemId: "7870",
        name: "Banana elegida x kg.",
        brand: "Genérico",
        measure: { dimension: "weight", amount: 1000 },
        weightStepKg: null,
        teasers: [],
        tipo: "Banana",
      },
    ]);
  });
});
