import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it, vi } from "vitest";
import { createCarrefourStore, HttpError, type HttpRequest } from "./carrefour-store.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8"));

type Route = [RegExp, string] | [RegExp, string, number];

const signal = new AbortController().signal;

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

const regionRoutes: Route[] = [
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=1425$/, "regions"],
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=C1425ABC$/, "regions-empty"],
  [/\/checkout\/pub\/regions\?country=ARG&postalCode=abc$/, "regions-rejected", 400],
];

describe("createCarrefourStore", () => {
  it("delivers to a postal code whose region has stores", async () => {
    const { store, seen } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("1425", signal), "delivers");
    assert.equal(seen.length, 1);
  });

  it("does not deliver to a postal code whose region has no stores", async () => {
    const { store } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("C1425ABC", signal), "does-not-deliver");
  });

  it("does not deliver to a postal code with no region", async () => {
    const store = createCarrefourStore(() => Promise.resolve([]));
    assert.equal(await store.checkDelivery("1425", signal), "does-not-deliver");
  });

  it("tells a postal code Carrefour rejects", async () => {
    const { store } = recorded(regionRoutes);
    assert.equal(await store.checkDelivery("abc", signal), "postal-code-rejected");
  });

  it("fails the delivery check when Carrefour answers with another error", async () => {
    const store = createCarrefourStore((request) =>
      Promise.reject(new HttpError(request, 503, "Service Unavailable")),
    );
    await assert.rejects(store.checkDelivery("1425", signal), /answered 503/);
  });

  it("asks Carrefour for the region of a postal code once", async () => {
    const { store, seen } = recorded(regionRoutes);
    await store.checkDelivery("1425", signal);
    await store.checkDelivery("1425", signal);
    assert.equal(seen.length, 1);
  });

  it("fails when Carrefour answers with an error", async () => {
    const store = createCarrefourStore(() =>
      Promise.reject(new Error("Carrefour GET answered 503")),
    );
    await assert.rejects(
      store.simulate({ postalCode: "1425", items: [{ itemId: "3807", quantity: 1 }] }, signal),
      /503/,
    );
  });

  it("simulates with all promotions, the postal code and seller 1, in pesos", async () => {
    const { store, seen } = recorded([[/orderForms\/simulation/, "simulation-promotion"]]);
    const simulation = await store.simulate(
      {
        postalCode: "1425",
        items: [{ itemId: "3807", quantity: 2 }],
      },
      signal,
    );
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
    const simulation = await store.simulate(
      {
        postalCode: "1425",
        items: [{ itemId: "11187", quantity: 1 }],
      },
      signal,
    );
    assert.equal(simulation.lines[0]?.available, false);
    assert.equal(simulation.total, 0);
  });

  it("links a Carrefour cart with every item from seller 1, skus in text order and quantities padded to keep that order", () => {
    const store = createCarrefourStore(() => Promise.reject(new Error("a link needs no request")));
    assert.equal(
      store.cartLink([
        { itemId: "9008", quantity: 1 },
        { itemId: "217502", quantity: 2 },
      ]),
      "https://www.carrefour.com.ar/checkout/cart/add?sku=217502&qty=02&seller=1&sku=9008&qty=1&seller=1&sc=1",
    );
  });

  it("links a cart that Carrefour reads with every quantity at its sku", () => {
    const store = createCarrefourStore(() => Promise.reject(new Error("a link needs no request")));
    const items = [
      { itemId: "19873", quantity: 1 },
      { itemId: "57446", quantity: 2 },
      { itemId: "11324", quantity: 4 },
      { itemId: "25012", quantity: 1 },
      { itemId: "156687", quantity: 3 },
      { itemId: "186506", quantity: 1 },
      { itemId: "6631", quantity: 1 },
      { itemId: "57565", quantity: 2 },
      { itemId: "249859", quantity: 1 },
      { itemId: "172757", quantity: 1 },
      { itemId: "294448", quantity: 10 },
    ];
    const cart = asCarrefourReadsIt(store.cartLink(items));
    assert.deepEqual(cart, new Map(items.map(({ itemId, quantity }) => [itemId, quantity])));
  });
});

describe("createCarrefourStore and its signal", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the signal of each call to every request it makes", async () => {
    const { store, seen } = recorded([
      ...regionRoutes,
      [/orderForms\/simulation/, "simulation-banana"],
    ]);
    const controller = new AbortController();
    await store.checkDelivery("1425", controller.signal);
    await store.simulate(
      { postalCode: "1425", items: [{ itemId: "7870", quantity: 1 }] },
      controller.signal,
    );
    assert.equal(seen.length, 2);
    assert.ok(seen.every((request) => request.signal === controller.signal));
  });

  it("asks again for a region whose lookup failed instead of keeping the failure", async () => {
    let failRegions = true;
    const http = () => {
      if (failRegions) {
        failRegions = false;
        return Promise.reject(new Error("aborted"));
      }
      return Promise.resolve(fixture("regions"));
    };
    const store = createCarrefourStore(http);
    await assert.rejects(store.checkDelivery("1425", signal), /aborted/);
    assert.equal(await store.checkDelivery("1425", signal), "delivers");
  });

  it("hands the signal to fetch", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    vi.stubGlobal("fetch", (_url: string, init: RequestInit) => {
      signals.push(init.signal);
      return Promise.resolve(Response.json(fixture("regions")));
    });
    const controller = new AbortController();
    assert.equal(await createCarrefourStore().checkDelivery("1425", controller.signal), "delivers");
    assert.deepEqual(signals, [controller.signal]);
  });
});

function asCarrefourReadsIt(link: string): Map<string, number> {
  const params = new URL(link).searchParams;
  const textOrder = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const skus = params.getAll("sku").sort(textOrder);
  const quantities = params.getAll("qty").sort(textOrder);
  return new Map(skus.map((sku, index) => [sku, Number(quantities[index])]));
}
