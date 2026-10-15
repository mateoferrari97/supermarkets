import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, Sale, Teaser } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Item } from "../order-matching/item.ts";
import type { FitProductsInput, FitProductsOutput } from "../order-matching/match-items.ts";
import { CART_WARNING } from "../product-selection/cart.ts";
import type {
  Delivery,
  OnlineStore,
  SimulationRequest,
} from "../product-selection/online-store.ts";
import type { StepEvent } from "./steps.ts";
import {
  IGNORED_PREFERENCE_NOTE,
  NEW_CONVERSATION,
  ORDER_QUESTION,
  POSTAL_CODE_QUESTION,
  takeTurn,
  type Cart,
  type ConversationDependencies,
  type ConversationState,
} from "./take-turn.ts";

const packaged = (dimension: "volume" | "weight", amount: number): Sale => ({
  kind: "packaged",
  size: { dimension, amount },
});

const product = (
  itemId: string,
  name: string,
  price: number,
  sale: Sale,
  teasers: Teaser[] = [],
): CatalogProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  department: "Bebidas",
  tipo: null,
  price,
  inStock: true,
  sale,
  teasers,
});

const catalog: CatalogProduct[] = [
  product("1", "Yerba mate Playadito 1 kg", 3000, packaged("weight", 1000)),
  product("2", "Gaseosa Coca Cola Zero 2 l", 2000, packaged("volume", 2000), [
    { name: "2do al 50%", minimumQuantity: 2 },
  ]),
  product("3", "Gaseosa Coca Cola Zero 1,5 l", 1800, packaged("volume", 1500)),
  product("4", "Queso Port Salut Sancor 500 g", 4000, packaged("weight", 500)),
  product("5", "Queso Port Salut La Serenísima 500 g", 4200, packaged("weight", 500)),
  product("6", "Carbón vegetal Carbocor 4 kg", 5000, packaged("weight", 4000)),
  product("7", "Fernet Branca 750 ml", 9000, packaged("volume", 750)),
];

const words = (text: string) => text.toLowerCase().split(/\W+/u).filter(Boolean);

const search: CatalogSearch = {
  findMatches: ({ product: wanted }, limit = 30) => {
    const query = new Set(words(wanted));
    return catalog
      .filter((candidate) => words(candidate.name).some((word) => query.has(word)))
      .slice(0, limit);
  },
};

const item = (original: string, product: string, overrides: Partial<Item> = {}): Item => ({
  original,
  product,
  brand: null,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
  ...overrides,
});

type Script = {
  items?: Item[];
  ignoredPreference?: boolean;
  answers?: Record<string, (input: FitProductsInput) => Partial<FitProductsOutput>>;
  unavailableAlone?: string[];
  unavailableInCart?: string[];
  savings?: Record<string, number>;
  deliveries?: Record<string, Delivery>;
};

const conversation = ({
  items = [],
  ignoredPreference = false,
  answers = {},
  unavailableAlone = [],
  unavailableInCart = [],
  savings = {},
  deliveries = {},
}: Script = {}) => {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const simulations: SimulationRequest[] = [];
  const seen = (name: string, signal: AbortSignal) => {
    calls.push(name);
    signals.push(signal);
  };
  const priceOf = (itemId: string) => catalog.find((known) => known.itemId === itemId)!.price!;
  const deps: ConversationDependencies = {
    search,
    llm: {
      parseOrder: (_text, signal) => {
        seen("parseOrder", signal);
        return Promise.resolve({ items, ignoredPreference });
      },
      fitProducts: (input, signal) => {
        seen("fitProducts", signal);
        return Promise.resolve({
          fits: input.matches.map((_match, index) => index + 1),
          closest: [],
          note: null,
          question: null,
          ...answers[input.item.product]?.(input),
        });
      },
    },
    store: {
      checkDelivery: (postalCode, signal) => {
        seen("checkDelivery", signal);
        return Promise.resolve(deliveries[postalCode] ?? "delivers");
      },
      simulate: (request, signal) => {
        seen("simulate", signal);
        simulations.push(request);
        const unavailable = request.items.length === 1 ? unavailableAlone : unavailableInCart;
        const lines = request.items.map(({ itemId, quantity }) => {
          const unit = quantity >= 2 && itemId === "2" ? priceOf(itemId) * 0.75 : priceOf(itemId);
          return {
            itemId,
            quantity,
            available: !unavailable.includes(itemId),
            total: unit * quantity,
            savings: savings[itemId] ?? 0,
            promotions: [],
          };
        });
        const total = lines.reduce((sum, line) => sum + (line.available ? line.total : 0), 0);
        return Promise.resolve({ lines, total });
      },
      cartLink: (cart) =>
        `cart:${cart.map(({ itemId, quantity }) => `${itemId}x${quantity}`).join(",")}`,
    } satisfies OnlineStore,
  };
  return { deps, calls, signals, simulations };
};

const ordering: ConversationState = { stage: "order", postalCode: "1425" };

const cartOf = async (script: Script, text = "pedido"): Promise<Cart> => {
  const { deps } = conversation(script);
  const turn = await takeTurn(ordering, text, deps);
  assert.equal(turn.reply.kind, "cart");
  if (turn.reply.kind !== "cart") throw new Error("no cart");
  return turn.reply.cart;
};

const linesOf = (cart: Cart) => cart.lines.map((line) => [line.original, line.product.itemId]);

describe("takeTurn", () => {
  describe("postal code", () => {
    it("asks for the postal code when a new conversation has none", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "", deps);
      assert.deepEqual(turn, {
        state: { stage: "postal-code" },
        reply: { kind: "ask", text: POSTAL_CODE_QUESTION },
      });
      assert.deepEqual(calls, []);
    });

    it("asks again when the reply holds no postal code", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "Palermo", deps);
      assert.deepEqual(turn.state, { stage: "postal-code" });
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `"Palermo" no es un código postal válido. ${POSTAL_CODE_QUESTION}`,
      });
      assert.deepEqual(calls, []);
    });

    it("asks again when Carrefour rejects the postal code", async () => {
      const { deps } = conversation({ deliveries: { "9999": "postal-code-rejected" } });
      const turn = await takeTurn(NEW_CONVERSATION, "9999", deps);
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `"9999" no es un código postal válido. ${POSTAL_CODE_QUESTION}`,
      });
    });

    it("asks again when Carrefour does not deliver to the postal code", async () => {
      const { deps } = conversation({ deliveries: { "9410": "does-not-deliver" } });
      const turn = await takeTurn(NEW_CONVERSATION, "envío a 9410", deps);
      assert.deepEqual(turn.reply, {
        kind: "ask",
        text: `Carrefour no entrega en el código postal 9410. ${POSTAL_CODE_QUESTION}`,
      });
    });

    it("asks for the order once Carrefour delivers to the postal code", async () => {
      const { deps, calls } = conversation();
      const turn = await takeTurn(NEW_CONVERSATION, "envío a 1425", deps);
      assert.deepEqual(turn, {
        state: { stage: "order", postalCode: "1425" },
        reply: { kind: "ask", text: ORDER_QUESTION },
      });
      assert.deepEqual(calls, ["checkDelivery"]);
    });
  });

  describe("order", () => {
    it("asks for the order again when the reply is empty", async () => {
      const { deps, calls } = conversation({ items: [item("yerba", "yerba")] });
      const turn = await takeTurn(ordering, "  ", deps);
      assert.deepEqual(turn, { state: ordering, reply: { kind: "ask", text: ORDER_QUESTION } });
      assert.deepEqual(calls, []);
    });

    it("delivers the cart of the Candidates the Selection Policy picks", async () => {
      const { deps, simulations } = conversation({ items: [item("yerba", "yerba")] });
      const turn = await takeTurn(ordering, "yerba", deps);
      assert.equal(turn.reply.kind, "cart");
      if (turn.reply.kind !== "cart") return;
      const { cart } = turn.reply;
      assert.deepEqual(turn.state, { stage: "done", postalCode: "1425", cart });
      assert.deepEqual(linesOf(cart), [["yerba", "1"]]);
      assert.equal(cart.total, 3000);
      assert.equal(cart.cartLink, "cart:1x1");
      assert.deepEqual(cart.notes, []);
      assert.deepEqual(
        simulations.map(({ postalCode, items }) => [postalCode, items]),
        [
          ["1425", [{ itemId: "1", quantity: 1 }]],
          ["1425", [{ itemId: "1", quantity: 1 }]],
        ],
      );
    });

    it("puts each Note under its line and the Items not got and the preference after the table", async () => {
      const cart = await cartOf({
        items: [
          item("coca zero de 2,25", "coca cola zero", {
            size: { kind: "exact", dimension: "volume", amount: 2250 },
          }),
          item("queso porsalud", "queso port salut"),
          item("fernet chico", "fernet"),
        ],
        ignoredPreference: true,
        answers: {
          "coca cola zero": () => ({ fits: [1, 2], note: "Tomé 'coca' como Coca Cola." }),
          "queso port salut": () => ({ fits: [1, 2], note: "Tomé 'porsalud' como Port Salut." }),
          fernet: () => ({
            fits: [],
            closest: [1],
            question: "No hay fernet chico. ¿Te sirve el de 750 ml?",
          }),
        },
        savings: { "5": 500 },
      });
      assert.deepEqual(linesOf(cart), [
        ["coca zero de 2,25", "2"],
        ["queso porsalud", "5"],
      ]);
      assert.deepEqual(cart.lines[0]!.notes, [
        "Tomé 'coca' como Coca Cola.",
        "No hay de 2,25 l; llevo 2 l",
        "Llevando 2 sale $1500.00 c/u en vez de $2000.00 (2do al 50%)",
      ]);
      assert.deepEqual(cart.lines[1]!.notes, ["Tomé 'porsalud' como Port Salut."]);
      assert.deepEqual(cart.notes, [
        'No conseguí "fernet chico": No hay fernet chico. ¿Te sirve el de 750 ml?',
        IGNORED_PREFERENCE_NOTE,
      ]);
      assert.equal(cart.warning, CART_WARNING);
    });

    it("tells about an ignored card or preference even when every Item is bought", async () => {
      const cart = await cartOf({ items: [item("yerba", "yerba")], ignoredPreference: true });
      assert.deepEqual(cart.notes, [IGNORED_PREFERENCE_NOTE]);
      assert.equal(cart.warning, CART_WARNING);
    });

    it("leaves out an Item with no Fit with its question as the Note and never simulates it", async () => {
      const { deps, simulations } = conversation({
        items: [item("yerba", "yerba"), item("carbón", "carbón")],
        answers: { carbón: () => ({ fits: [], closest: [1], question: "¿Te sirve este?" }) },
      });
      const turn = await takeTurn(ordering, "yerba y carbón", deps);
      if (turn.reply.kind !== "cart") throw new Error("no cart");
      assert.deepEqual(linesOf(turn.reply.cart), [["yerba", "1"]]);
      assert.deepEqual(turn.reply.cart.notes, ['No conseguí "carbón": ¿Te sirve este?']);
      assert.ok(simulations.every(({ items }) => items.every(({ itemId }) => itemId !== "6")));
    });

    it("leaves out an Item whose every Candidate is unavailable in the Branch", async () => {
      const cart = await cartOf({
        items: [item("yerba", "yerba"), item("queso", "queso port salut")],
        unavailableAlone: ["4", "5"],
      });
      assert.deepEqual(linesOf(cart), [["yerba", "1"]]);
      assert.deepEqual(cart.notes, [
        'No conseguí "queso": no hay ninguno disponible en tu sucursal',
      ]);
    });

    it("drops a Candidate unavailable alone and lets the Selection Policy pick among the rest", async () => {
      const cart = await cartOf({
        items: [item("queso", "queso port salut")],
        unavailableAlone: ["4"],
      });
      assert.deepEqual(linesOf(cart), [["queso", "5"]]);
      assert.deepEqual(cart.lines[0]!.notes, []);
    });

    it("replaces a product unavailable in the whole cart by the Item's next ranked Candidate", async () => {
      const { deps, simulations } = conversation({
        items: [item("yerba", "yerba"), item("queso", "queso port salut")],
        unavailableInCart: ["4"],
      });
      const turn = await takeTurn(ordering, "yerba y queso", deps);
      if (turn.reply.kind !== "cart") throw new Error("no cart");
      const { cart } = turn.reply;
      assert.deepEqual(linesOf(cart), [
        ["yerba", "1"],
        ["queso", "5"],
      ]);
      assert.deepEqual(cart.lines[1]!.notes, [
        '"Queso Port Salut Sancor 500 g" no estaba disponible al armar el carrito: lo cambié por "Queso Port Salut La Serenísima 500 g"',
      ]);
      assert.equal(cart.total, 7200);
      assert.equal(cart.cartLink, "cart:1x1,5x1");
      assert.deepEqual(
        simulations.filter(({ items }) => items.length > 1).map(({ items }) => items),
        [
          [
            { itemId: "1", quantity: 1 },
            { itemId: "4", quantity: 1 },
          ],
          [
            { itemId: "1", quantity: 1 },
            { itemId: "5", quantity: 1 },
          ],
        ],
      );
    });

    it("calls only call 1, call 2 and checkout simulation for an order", async () => {
      const { deps, calls } = conversation({ items: [item("yerba", "yerba")] });
      await takeTurn(ordering, "yerba", deps);
      assert.deepEqual(new Set(calls), new Set(["parseOrder", "fitProducts", "simulate"]));
    });

    it("refuses a turn once the cart was delivered", async () => {
      const { deps } = conversation({ items: [item("yerba", "yerba")] });
      const { state } = await takeTurn(ordering, "yerba", deps);
      await assert.rejects(takeTurn(state, "más yerba", deps), /already delivered/);
    });
  });

  describe("steps", () => {
    it("reports understanding the order, one step per Item and simulating the cart, in order", async () => {
      const { deps } = conversation({
        items: [item("yerba", "yerba"), item("2 quesos", "queso port salut")],
      });
      const events: StepEvent[] = [];
      await takeTurn(ordering, "yerba y 2 quesos", deps, (event) => events.push(event));
      const started = events.filter(({ status }) => status === "started").map(({ step }) => step);
      assert.deepEqual(started, [
        { kind: "understand-order" },
        { kind: "choose-products", original: "yerba" },
        { kind: "choose-products", original: "2 quesos" },
        { kind: "simulate-cart" },
      ]);
      assert.deepEqual(events.at(-1), { status: "done", step: { kind: "simulate-cart" } });
      assert.equal(events.length, 8);
    });
  });

  describe("abort", () => {
    it("passes the turn's signal to every call of the LLM and the store", async () => {
      const { deps, calls, signals } = conversation({ items: [item("yerba", "yerba")] });
      const controller = new AbortController();
      const { state } = await takeTurn(NEW_CONVERSATION, "1425", {
        ...deps,
        signal: controller.signal,
      });
      await takeTurn(state, "yerba", { ...deps, signal: controller.signal });
      assert.deepEqual(
        new Set(calls),
        new Set(["checkDelivery", "parseOrder", "fitProducts", "simulate"]),
      );
      assert.ok(signals.every((signal) => signal === controller.signal));
    });

    it("stops an aborted turn before it simulates and leaves the state as it was", async () => {
      const state = structuredClone(ordering);
      const controller = new AbortController();
      const { deps, simulations } = conversation({ items: [item("yerba", "yerba")] });
      const aborting: ConversationDependencies = {
        ...deps,
        signal: controller.signal,
        llm: {
          ...deps.llm,
          fitProducts: (input, signal) => {
            controller.abort();
            return deps.llm.fitProducts(input, signal);
          },
        },
      };
      await assert.rejects(takeTurn(state, "yerba", aborting), { name: "AbortError" });
      assert.deepEqual(state, ordering);
      assert.deepEqual(simulations, []);
    });

    it("does not start a turn whose signal is already aborted", async () => {
      const { deps, calls } = conversation();
      const controller = new AbortController();
      controller.abort();
      await assert.rejects(
        takeTurn(NEW_CONVERSATION, "1425", { ...deps, signal: controller.signal }),
        { name: "AbortError" },
      );
      assert.deepEqual(calls, []);
    });
  });
});
