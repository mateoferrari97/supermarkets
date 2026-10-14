import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "vitest";
import {
  createCarrefourStore,
  HttpError,
  snapshotProducts,
  type HttpRequest,
} from "./carrefour-store.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

type Route = [RegExp, string] | [RegExp, string, number];

const recorded = (routes: Route[]) => {
  const seen: HttpRequest[] = [];
  const http = (request: HttpRequest) => {
    seen.push(request);
    const route = routes.find(([pattern]) => pattern.test(request.url));
    if (!route) return Promise.reject(new Error(`no recorded response for ${request.url}`));
    const [, name, status] = route;
    if (status !== undefined) {
      return Promise.reject(new HttpError(request, status, fixture(name)));
    }
    return Promise.resolve(fixture(name));
  };
  return { store: createCarrefourStore(http), seen };
};

const searchRoutes: Route[] = [
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

const regionRoutes: Route[] = [
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=1425$/, "regions"],
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=C1425ABC$/, "regions-empty"],
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=abc$/, "regions-rejected", 400],
];

describe("createCarrefourStore", () => {
  it("delivers to a postal code whose region has stores", async () => {
    const { store, seen } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("1425"), "delivers");
    assert.equal(seen.length, 1);
  });

  it("does not deliver to a postal code whose region has no stores", async () => {
    const { store } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("C1425ABC"), "does-not-deliver");
  });

  it("does not deliver to a postal code with no region", async () => {
    const store = createCarrefourStore(() => Promise.resolve([]));
    assert.equal(await store.checkDelivery("1425"), "does-not-deliver");
  });

  it("tells a postal code Carrefour rejects", async () => {
    const { store } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("abc"), "postal-code-rejected");
  });

  it("fails the delivery check when Carrefour answers with another error", async () => {
    const store = createCarrefourStore((request) =>
      Promise.reject(new HttpError(request, 503, "Service Unavailable")),
    );
    await assert.rejects(store.checkDelivery("1425"), /answered 503/);
  });

  it("searches in the region it checked delivery for, asking for the region once", async () => {
    const { store, seen } = recorded(searchRoutes);
    await store.checkDelivery("1425");
    await store.findCandidates({
      postalCode: "1425",
      tipos: ["Gaseosa"],
      brands: ["Coca-Cola"],
      sort: "discount:desc",
      limit: 2,
    });
    assert.equal(seen.filter(({ url }) => url.includes("/checkout/pub/regions")).length, 1);
  });

  it("fails instead of searching without a region", async () => {
    const seen: HttpRequest[] = [];
    const store = createCarrefourStore((request) => {
      seen.push(request);
      if (request.url.includes("/checkout/pub/regions")) return Promise.resolve([]);
      return Promise.resolve(fixture("facets-query-gaseosa"));
    });
    await assert.rejects(
      store.findCandidates({
        postalCode: "1425",
        tipos: ["Gaseosa"],
        brands: [],
        sort: "discount:desc",
        limit: 2,
      }),
      /no region for postal code 1425/,
    );
    assert.ok(seen.every(({ url }) => !url.includes("/product-search/")));
  });

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

  it("finds a brand written with one letter wrong", async () => {
    const { store, seen } = recorded(searchRoutes);
    const candidates = await store.findCandidates({
      postalCode: "1425",
      tipos: ["Gaseosa"],
      brands: ["Coca Kola"],
      sort: "discount:desc",
      limit: 2,
    });
    assert.equal(candidates.length, 2);
    assert.match(seen.at(-1)!.url, /\/brand\/coca-cola\?/);
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

  it("links a Carrefour cart with every item at its quantity from seller 1", () => {
    const store = createCarrefourStore(() => Promise.reject(new Error("a link needs no request")));
    assert.equal(
      store.cartLink([
        { itemId: "217502", quantity: 2 },
        { itemId: "9008", quantity: 1 },
      ]),
      "https://www.carrefour.com.ar/checkout/cart/add?sku=217502&qty=2&seller=1&sku=9008&qty=1&seller=1&sc=1",
    );
  });

  it("takes the measure's dimension from the name when the name gives one size of the other dimension", () => {
    const record = {
      productId: "1",
      skuIds: ["9008"],
      name: "Mostaza Natura 500 g.",
      tipo: "Mostaza",
      measureUnit: "CM3",
      consumptionQuantity: "500.00",
    };
    const [mostaza, lata] = snapshotProducts([
      record,
      { ...record, skuIds: ["1000"], name: "Gaseosa Coca Cola 354 ml", consumptionQuantity: "354" },
    ]);
    assert.deepEqual(mostaza?.measure, { dimension: "weight", amount: 500 });
    assert.deepEqual(lata?.measure, { dimension: "volume", amount: 354 });
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
