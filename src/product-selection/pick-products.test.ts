import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item, SelectionPolicy } from "../order-resolution/llm.ts";
import type { OrderItem, OrderResolution } from "../order-resolution/resolve-order.ts";
import { pickProducts, type PickDependencies } from "./pick-products.ts";
import type {
  CandidateQuery,
  OnlineStore,
  SimulatedLine,
  SimulationRequest,
  SnapshotProduct,
  StoreProduct,
} from "./store.ts";

const mapping = {
  Gaseosa: "gaseosa",
  "Gaseosa light": "gaseosa",
  Yerba: "yerba",
  "Yerba compuesta": "yerba-compuesta",
  Banana: "banana",
  "Leche balsámica": null,
};

const paymentCards = {
  cards: [{ names: ["Tarjeta Carrefour Mastercard"], paymentSystem: "502", bin: "507858" }],
};

const product = (
  itemId: string,
  name: string,
  ml: number | null,
  overrides: Partial<StoreProduct> = {},
): StoreProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  measure: ml === null ? null : { dimension: "volume", amount: ml },
  weightStepKg: null,
  teasers: [],
  ...overrides,
});

type Price = {
  unit: number;
  savings?: number;
  promotion?: string;
  available?: boolean;
  withCard?: Omit<Price, "withCard">;
  atLeast?: { quantity: number; unit: number; promotion: string };
};

const fakeStore = (
  candidates: (query: CandidateQuery) => StoreProduct[],
  prices: Record<string, Price>,
) => {
  const queries: CandidateQuery[] = [];
  const simulations: SimulationRequest[] = [];
  const store: OnlineStore = {
    checkDelivery: () => Promise.reject(new Error("product picking never checks delivery")),
    cartLink: (items) => items.map(({ itemId, quantity }) => `${itemId}x${quantity}`).join(","),
    findCandidates: (query) => {
      queries.push(query);
      return Promise.resolve(candidates(query));
    },
    simulate: (request) => {
      simulations.push(request);
      const lines = request.items.map(({ itemId, quantity }): SimulatedLine => {
        const listed = prices[itemId] ?? { unit: 0, available: false };
        const carded = request.card && listed.withCard ? listed.withCard : listed;
        const price =
          listed.atLeast && quantity >= listed.atLeast.quantity
            ? { ...carded, unit: listed.atLeast.unit, promotion: listed.atLeast.promotion }
            : carded;
        return {
          itemId,
          quantity,
          available: price.available ?? true,
          total: price.unit * quantity,
          savings: price.savings ?? (price.promotion ? 1 : 0),
          promotions: price.promotion ? [price.promotion] : [],
        };
      });
      const total = lines
        .filter(({ available }) => available)
        .reduce((sum, { total }) => sum + total, 0);
      return Promise.resolve({ lines, total });
    },
  };
  return { store, queries, simulations, items: () => simulations.map(({ items }) => items) };
};

const orderItem = (phrase: string, ids: string[], overrides: Partial<Item> = {}): OrderItem => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  ...overrides,
  productTypes: ids.map((id) => ({ id, name: id })),
  question: null,
});

const order = (...items: OrderItem[]): OrderResolution => ({
  items,
  paymentCard: null,
  preference: null,
  message: null,
});

const policy = (overrides: Partial<SelectionPolicy> = {}): SelectionPolicy => ({
  ranking: "savings-first",
  brandsOnly: [],
  brandsPreferred: [],
  brandsExcluded: [],
  unexpressed: [],
  ...overrides,
});

const depending = (
  store: OnlineStore,
  overrides: Partial<PickDependencies> = {},
): PickDependencies => ({
  mapping,
  store,
  llm: { translatePreference: () => Promise.reject(new Error("no preference was written")) },
  paymentCards,
  snapshot: [],
  ...overrides,
});

const pick = (resolution: OrderResolution, dependencies: PickDependencies) =>
  pickProducts(resolution, "1425", dependencies);

const translating = (translated: SelectionPolicy) => {
  const asked: string[] = [];
  return {
    asked,
    llm: {
      translatePreference: ({ preference }: { preference: string }) => {
        asked.push(preference);
        return Promise.resolve(translated);
      },
    },
  };
};

const coca = product("3807", "Coca Cola 2,25 lts", 2250, { brand: "Coca Cola" });
const zero = product("11324", "Coca Cola Zero 2,25 lts", 2250, { brand: "Coca Cola" });
const lata = product("1000", "Coca Cola lata 354 ml", 354, { brand: "Coca Cola" });
const pepsi = product("2000", "Pepsi 2,25 lts", 2250, { brand: "Pepsi" });
const manaos = product("4000", "Manaos cola 2,25 lts", 2250, { brand: "Manaos" });
const banana = product("185818", "Banana selección x kg.", null, {
  measure: { dimension: "weight", amount: 500 },
  weightStepKg: 0.5,
});

describe("pickProducts", () => {
  it("searches the Item's Tipos, brand and postal code for two Candidates sorted by discount", async () => {
    const { store, queries } = fakeStore(() => [], {});
    await pickProducts(
      order(
        orderItem("coca", ["gaseosa"], { brand: "Coca-Cola" }),
        orderItem("yerba", ["yerba", "yerba-compuesta"]),
      ),
      "5000",
      depending(store),
    );
    assert.deepEqual(queries, [
      {
        postalCode: "5000",
        tipos: ["Gaseosa", "Gaseosa light"],
        brands: ["Coca-Cola"],
        sort: "discount:desc",
        limit: 10,
      },
      {
        postalCode: "5000",
        tipos: ["Yerba", "Yerba compuesta"],
        brands: [],
        sort: "discount:desc",
        limit: 10,
      },
    ]);
  });

  it("simulates each Candidate alone and picks the one with savings first", async () => {
    const { store, items } = fakeStore(() => [zero, coca], {
      "11324": { unit: 4000 },
      "3807": { unit: 4500, savings: 3000, promotion: "2do al 50%" },
    });
    const selection = await pick(
      order(orderItem("coca", ["gaseosa"], { quantity: 2 })),
      depending(store),
    );
    assert.deepEqual(items().slice(0, 2), [
      [{ itemId: "11324", quantity: 2 }],
      [{ itemId: "3807", quantity: 2 }],
    ]);
    assert.deepEqual(items().at(-1), [{ itemId: "3807", quantity: 2 }]);
    assert.deepEqual(selection, {
      postalCode: "1425",
      lines: [
        {
          phrase: "coca",
          product: coca,
          quantity: 2,
          unitPrice: 4500,
          total: 9000,
          reason: "Promoción: 2do al 50%.",
          notices: [],
        },
      ],
      total: 9000,
      cartLink: "3807x2",
      notices: [],
      unexpressed: [],
    });
  });

  it("links a cart with the products picked and leaves out Items with none", async () => {
    const { store } = fakeStore((query) => (query.tipos.includes("Gaseosa") ? [coca] : []), {
      "3807": { unit: 4500 },
    });
    const filled = await pick(
      order(orderItem("coca", ["gaseosa"], { quantity: 3 }), orderItem("yerba", ["yerba"])),
      depending(store),
    );
    assert.equal(filled.cartLink, "3807x3");
    const empty = await pick(order(orderItem("yerba", ["yerba"])), depending(store));
    assert.equal(empty.cartLink, null);
  });

  it("without savings picks the lowest price per unit of measure, not per package", async () => {
    const { store } = fakeStore(() => [lata, coca], {
      "1000": { unit: 1000 },
      "3807": { unit: 6000 },
    });
    const { lines } = await pick(order(orderItem("coca", ["gaseosa"])), depending(store));
    assert.equal(lines[0]?.product, coca);
    assert.equal(lines[0]?.reason, "Es el más barato por litro.");
  });

  it("breaks a tie by the lowest itemId and compares package prices when measures are unknown", async () => {
    const tie = fakeStore(() => [coca, zero], { "3807": { unit: 6000 }, "11324": { unit: 6000 } });
    assert.equal(
      (await pick(order(orderItem("coca", ["gaseosa"])), depending(tie.store))).lines[0]?.product,
      coca,
    );
    const unknown = [product("2", "Yerba A", null), product("1", "Yerba B", null)];
    const plain = fakeStore(() => unknown, { "2": { unit: 3000 }, "1": { unit: 3500 } });
    assert.equal(
      (await pick(order(orderItem("yerba", ["yerba"])), depending(plain.store))).lines[0]?.product,
      unknown[0],
    );
  });

  it("picks among every Product Type of an Item resolved to several", async () => {
    const compuesta = product("7", "Yerba compuesta 500 g", null, {
      measure: { dimension: "weight", amount: 500 },
    });
    const comun = product("8", "Yerba 1 kg", null, {
      measure: { dimension: "weight", amount: 1000 },
    });
    const { store, queries } = fakeStore(() => [compuesta, comun], {
      "7": { unit: 3000 },
      "8": { unit: 5000 },
    });
    const { lines } = await pick(
      order(orderItem("yerba", ["yerba", "yerba-compuesta"])),
      depending(store),
    );
    assert.deepEqual(queries[0]?.tipos, ["Yerba", "Yerba compuesta"]);
    assert.equal(lines[0]?.product, comun);
    assert.equal(lines[0]?.reason, "Es el más barato por kilo.");
  });

  it("skips a Candidate unavailable in its simulation and simulates the next result instead", async () => {
    const { store, items } = fakeStore(() => [coca, zero, lata], {
      "3807": { unit: 4500, savings: 3000, available: false },
      "11324": { unit: 6000 },
      "1000": { unit: 1000 },
    });
    const { lines } = await pick(order(orderItem("coca", ["gaseosa"])), depending(store));
    assert.deepEqual(
      items()
        .slice(0, 3)
        .map(([first]) => first?.itemId),
      ["3807", "11324", "1000"],
    );
    assert.equal(lines[0]?.product, zero);
    assert.equal(lines[0]?.reason, "Es el más barato por litro.");
  });

  it("says when only one Candidate was available", async () => {
    const { store } = fakeStore(() => [coca, zero], {
      "3807": { unit: 4500, available: false },
      "11324": { unit: 6000 },
    });
    const { lines } = await pick(order(orderItem("coca", ["gaseosa"])), depending(store));
    assert.equal(lines[0]?.reason, "Es el único disponible entre los candidatos.");
  });

  it("refuses an order that still has questions or no accepted postal code", async () => {
    const { store, queries } = fakeStore(() => [], {});
    await assert.rejects(pick({ ...order(), message: "Tengo una pregunta" }, depending(store)));
    const coca = order(orderItem("coca", ["gaseosa"]));
    await assert.rejects(pickProducts(coca, "", depending(store)));
    await assert.rejects(pickProducts(coca, "C1425ABC", depending(store)));
    assert.deepEqual(queries, []);
  });

  it("simulates every Candidate and the cart for the postal code it was given", async () => {
    const { store, simulations } = fakeStore(() => [zero, coca], {
      "11324": { unit: 4000 },
      "3807": { unit: 4500 },
    });
    const selection = await pickProducts(
      order(orderItem("coca", ["gaseosa"])),
      "5000",
      depending(store),
    );
    assert.equal(selection.postalCode, "5000");
    assert.ok(simulations.length > 0);
    assert.ok(simulations.every(({ postalCode }) => postalCode === "5000"));
  });

  it("keeps only products whose name has every term, searching deeper when there are terms", async () => {
    const { store, queries } = fakeStore(() => [lata, zero, coca], {
      "1000": { unit: 1000 },
      "11324": { unit: 6000 },
      "3807": { unit: 5900 },
    });
    const { lines } = await pick(
      order(orderItem("coca", ["gaseosa"], { terms: ["2,25 l"] })),
      depending(store),
    );
    assert.equal(queries[0]?.limit, 50);
    assert.equal(lines[0]?.product, coca);
  });

  describe("Selection Policy", () => {
    it("asks the LLM for no policy when the order has no preference", async () => {
      const { store } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const { unexpressed } = await pick(order(orderItem("coca", ["gaseosa"])), depending(store));
      assert.deepEqual(unexpressed, []);
    });

    it("with cheapest-per-unit sorts search by price and ignores savings", async () => {
      const { llm, asked } = translating(policy({ ranking: "cheapest-per-unit" }));
      const { store, queries } = fakeStore(() => [zero, coca], {
        "11324": { unit: 4000 },
        "3807": { unit: 4500, savings: 3000, promotion: "2do al 50%" },
      });
      const { lines } = await pick(
        { ...order(orderItem("coca", ["gaseosa"])), preference: "lo más barato por litro" },
        depending(store, { llm }),
      );
      assert.deepEqual(asked, ["lo más barato por litro"]);
      assert.equal(queries[0]?.sort, "price:asc");
      assert.equal(lines[0]?.product, zero);
      assert.equal(lines[0]?.reason, "Es el más barato por litro.");
    });

    it("restricts search to the brands the Owner accepts only", async () => {
      const { llm } = translating(policy({ brandsOnly: ["La Serenísima"] }));
      const { store, queries } = fakeStore(() => [], {});
      await pick(
        { ...order(orderItem("leche", ["leche-entera"])), preference: "solo La Serenísima" },
        depending(store, { llm }),
      );
      assert.deepEqual(
        queries.map(({ brands }) => brands),
        [["La Serenísima"]],
      );
    });

    it("tries the preferred brands first and falls back to any brand, saying so", async () => {
      const { llm } = translating(policy({ brandsPreferred: ["Pepsi"] }));
      const { store, queries } = fakeStore(
        (query) => (query.brands.length > 0 ? [] : [coca, zero]),
        { "3807": { unit: 6000 }, "11324": { unit: 6000 } },
      );
      const { lines } = await pick(
        { ...order(orderItem("gaseosa", ["gaseosa"])), preference: "prefiero Pepsi" },
        depending(store, { llm }),
      );
      assert.deepEqual(
        queries.map(({ brands }) => brands),
        [["Pepsi"], []],
      );
      assert.equal(lines[0]?.product, coca);
      assert.deepEqual(lines[0]?.notices, ["No encontré Pepsi disponible: elegí otra marca."]);
    });

    it("keeps the preferred brand when it has a Candidate", async () => {
      const { llm } = translating(policy({ brandsPreferred: ["Pepsi"] }));
      const { store, queries } = fakeStore(
        (query) => (query.brands.includes("Pepsi") ? [pepsi] : [coca]),
        { "2000": { unit: 7000 }, "3807": { unit: 5000 } },
      );
      const { lines } = await pick(
        { ...order(orderItem("gaseosa", ["gaseosa"])), preference: "prefiero Pepsi" },
        depending(store, { llm }),
      );
      assert.equal(queries.length, 1);
      assert.equal(lines[0]?.product, pepsi);
    });

    it("never makes an excluded brand a Candidate, searching deeper to make up for it", async () => {
      const { llm } = translating(policy({ brandsExcluded: ["Manaos"] }));
      const { store, queries, items } = fakeStore(() => [manaos, pepsi], {
        "4000": { unit: 1000 },
        "2000": { unit: 5000 },
      });
      const { lines } = await pick(
        { ...order(orderItem("gaseosa", ["gaseosa"])), preference: "nada de Manaos" },
        depending(store, { llm }),
      );
      assert.equal(queries[0]?.limit, 50);
      assert.equal(
        items().some((simulated) => simulated.some(({ itemId }) => itemId === "4000")),
        false,
      );
      assert.equal(lines[0]?.product, pepsi);
    });

    it("lets a brand on the Item win over the order's brand rules", async () => {
      const { llm } = translating(
        policy({ brandsOnly: ["Pepsi"], brandsExcluded: ["Coca-Cola", "Coca Cola"] }),
      );
      const { store, queries } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const { lines } = await pick(
        {
          ...order(orderItem("coca", ["gaseosa"], { brand: "Coca-Cola" })),
          preference: "solo Pepsi, nada de Coca",
        },
        depending(store, { llm }),
      );
      assert.deepEqual(queries[0]?.brands, ["Coca-Cola"]);
      assert.equal(lines[0]?.product, coca);
    });

    it("reports the preferences no rule could express and goes ahead with the rest", async () => {
      const { llm } = translating(policy({ unexpressed: ["que sea orgánico"] }));
      const { store } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const selection = await pick(
        { ...order(orderItem("coca", ["gaseosa"])), preference: "que sea orgánico" },
        depending(store, { llm }),
      );
      assert.deepEqual(selection.unexpressed, ["que sea orgánico"]);
      assert.equal(selection.lines[0]?.product, coca);
    });
  });

  describe("Payment Card", () => {
    it("simulates with the named card so its promotions count and show in the reason", async () => {
      const { store, simulations } = fakeStore(() => [zero, coca], {
        "11324": { unit: 5000 },
        "3807": {
          unit: 6000,
          withCard: { unit: 4800, savings: 1200, promotion: "Tarjeta Carrefour 20% Off Martes" },
        },
      });
      const selection = await pick(
        {
          ...order(orderItem("coca", ["gaseosa"])),
          paymentCard: "tarjeta carrefour mastercard",
        },
        depending(store),
      );
      assert.ok(
        simulations.every(({ card }) => card?.paymentSystem === "502" && card.bin === "507858"),
      );
      assert.equal(selection.lines[0]?.product, coca);
      assert.equal(selection.lines[0]?.reason, "Promoción: Tarjeta Carrefour 20% Off Martes.");
      assert.equal(selection.total, 4800);
      assert.deepEqual(selection.notices, []);
    });

    it("reports a card not in the table and picks products without a card", async () => {
      const { store, simulations } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const selection = await pick(
        { ...order(orderItem("coca", ["gaseosa"])), paymentCard: "Visa Galicia" },
        depending(store),
      );
      assert.ok(simulations.every(({ card }) => card === null));
      assert.deepEqual(selection.notices, [
        'No conozco la tarjeta "Visa Galicia": elegí los productos sin sus promociones.',
      ]);
    });
  });

  describe("quantities", () => {
    it("buys once with no quantity, rounds a fraction up with a notice, and reports an Item with nothing available", async () => {
      const { store, items } = fakeStore((query) => (query.tipos.includes("Yerba") ? [] : [coca]), {
        "3807": { unit: 6000 },
      });
      const selection = await pick(
        order(
          orderItem("coca", ["gaseosa"]),
          orderItem("media coca", ["gaseosa"], { quantity: 0.5 }),
          orderItem("yerba", ["yerba"]),
        ),
        depending(store),
      );
      assert.deepEqual(items().at(-1), [
        { itemId: "3807", quantity: 1 },
        { itemId: "3807", quantity: 1 },
      ]);
      assert.deepEqual(selection.lines[0]?.notices, []);
      assert.deepEqual(selection.lines[1]?.notices, ["Redondeé 0,5 a 1 para no comprar menos."]);
      assert.deepEqual(selection.lines[2], {
        phrase: "yerba",
        product: null,
        quantity: 1,
        unitPrice: null,
        total: 0,
        reason: "No encontré ningún producto disponible.",
        notices: [],
      });
      assert.equal(selection.total, 12000);
    });

    it("names the brand and terms when no product with them is available", async () => {
      const { store } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const { lines } = await pick(
        order(orderItem("coca", ["gaseosa"], { brand: "Coca-Cola", terms: ["light"] })),
        depending(store),
      );
      assert.equal(lines[0]?.reason, "No encontré ningún producto Coca-Cola light disponible.");
    });

    it("buys a product sold by weight in its steps, from a weight term or the quantity in kg", async () => {
      const { store, items } = fakeStore(() => [banana], { "185818": { unit: 999.5 } });
      const selection = await pick(
        order(
          orderItem("banana", ["banana"], { terms: ["500 g"] }),
          orderItem("banana", ["banana"], { quantity: 0.3 }),
          orderItem("banana", ["banana"], { quantity: 1.2 }),
          orderItem("banana", ["banana"]),
        ),
        depending(store),
      );
      assert.deepEqual(
        items()
          .at(-1)
          ?.map(({ quantity }) => quantity),
        [1, 1, 3, 1],
      );
      assert.deepEqual(
        selection.lines.map(({ notices }) => notices),
        [
          [],
          ["Se vende de a 500 g: compro 500 g en vez de 300 g."],
          ["Se vende de a 500 g: compro 1,5 kg en vez de 1,2 kg."],
          [],
        ],
      );
      assert.equal(selection.lines[2]?.total, 2998.5);
    });

    it("says how much cheaper a promotion would be with more units, without adding them", async () => {
      const promo = "PROMO-2do al 50%";
      const teased = { ...coca, teasers: [{ name: promo, minimumQuantity: 2 }] };
      const { store } = fakeStore(() => [teased], {
        "3807": { unit: 6000, atLeast: { quantity: 2, unit: 4500, promotion: promo } },
      });
      const { lines } = await pick(order(orderItem("coca", ["gaseosa"])), depending(store));
      assert.equal(lines[0]?.quantity, 1);
      assert.equal(lines[0]?.total, 6000);
      assert.deepEqual(lines[0]?.notices, [
        `Llevando 2 sale $4500.00 c/u en vez de $6000.00 (${promo}).`,
      ]);
    });
  });

  describe("final check", () => {
    it("takes prices and the total from the final simulation of the whole cart and says when one changed", async () => {
      let calls = 0;
      const { store } = fakeStore(() => [coca], { "3807": { unit: 6000 } });
      const finalStore: OnlineStore = {
        ...store,
        simulate: (request) => {
          calls += 1;
          if (calls === 1) return store.simulate(request);
          return Promise.resolve({
            lines: [
              {
                itemId: "3807",
                quantity: 1,
                available: true,
                total: 5500,
                savings: 500,
                promotions: ["Precio final"],
              },
            ],
            total: 5500,
          });
        },
      };
      const selection = await pick(order(orderItem("coca", ["gaseosa"])), depending(finalStore));
      assert.equal(selection.total, 5500);
      assert.equal(selection.lines[0]?.unitPrice, 5500);
      assert.equal(selection.lines[0]?.reason, "Promoción: Precio final.");
      assert.deepEqual(selection.lines[0]?.notices, [
        "El precio cambió al armar el carrito: $6000.00 antes, $5500.00 ahora.",
      ]);
    });

    const goneInCart = (store: OnlineStore, gone: string): OnlineStore => ({
      ...store,
      simulate: async (request) => {
        const simulation = await store.simulate(request);
        if (request.items.length < 2) return simulation;
        const lines = simulation.lines.map((line) =>
          line.itemId === gone ? { ...line, available: false } : line,
        );
        const total = lines.filter(({ available }) => available).reduce((s, l) => s + l.total, 0);
        return { lines, total };
      },
    });

    it("swaps a product unavailable in the final simulation for the other Candidate", async () => {
      const { store, items } = fakeStore(
        (query) => (query.tipos.includes("Yerba") ? [product("9", "Yerba", null)] : [coca, zero]),
        { "3807": { unit: 5000 }, "11324": { unit: 6000 }, "9": { unit: 3000 } },
      );
      const selection = await pick(
        order(orderItem("coca", ["gaseosa"]), orderItem("yerba", ["yerba"])),
        depending(goneInCart(store, "3807")),
      );
      assert.deepEqual(items().at(-1), [
        { itemId: "11324", quantity: 1 },
        { itemId: "9", quantity: 1 },
      ]);
      assert.equal(selection.lines[0]?.product, zero);
      assert.deepEqual(selection.lines[0]?.notices, [
        '"Coca Cola 2,25 lts" dejó de estar disponible al armar el carrito: lo cambié por "Coca Cola Zero 2,25 lts".',
      ]);
      assert.equal(selection.total, 9000);
    });

    it("reports an Item as not filled when its last Candidate is unavailable in the final simulation", async () => {
      const yerba = product("9", "Yerba", null);
      const { store } = fakeStore((query) => (query.tipos.includes("Yerba") ? [yerba] : [coca]), {
        "3807": { unit: 5000 },
        "9": { unit: 3000 },
      });
      const selection = await pick(
        order(orderItem("coca", ["gaseosa"]), orderItem("yerba", ["yerba"])),
        depending(goneInCart(store, "3807")),
      );
      assert.equal(selection.lines[0]?.product, null);
      assert.deepEqual(selection.lines[0]?.notices, [
        '"Coca Cola 2,25 lts" dejó de estar disponible al armar el carrito.',
      ]);
      assert.equal(selection.total, 3000);
    });

    it("tries Catalog Snapshot products of the Item's Tipos two at a time when search finds none", async () => {
      const snapshot: SnapshotProduct[] = [
        { ...product("50", "Yerba vieja 1 kg", null), tipo: "Yerba" },
        { ...product("51", "Yerba agotada 1 kg", null), tipo: "Yerba" },
        { ...product("52", "Yerba de catálogo 1 kg", null), tipo: "Yerba" },
        { ...product("60", "Gaseosa de catálogo", null), tipo: "Gaseosa" },
      ];
      const { store, items } = fakeStore(() => [], {
        "50": { unit: 3000, available: false },
        "51": { unit: 3000, available: false },
        "52": { unit: 3200 },
      });
      const selection = await pick(
        order(orderItem("yerba", ["yerba"])),
        depending(store, { snapshot }),
      );
      assert.deepEqual(
        items()
          .slice(0, 3)
          .map(([first]) => first?.itemId),
        ["50", "51", "52"],
      );
      assert.equal(selection.lines[0]?.product?.itemId, "52");
      assert.deepEqual(selection.lines[0]?.notices, [
        "La búsqueda no lo encontró: lo elegí del catálogo.",
      ]);
      assert.equal(selection.total, 3200);
    });
  });
});
