import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct, Sale, Teaser } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Item } from "../order-matching/item.ts";
import type { FitProductsInput, FitProductsOutput } from "../order-matching/match-items.ts";
import type { ReadReplyInput, ReadReplyOutput } from "../order-matching/read-reply.ts";
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
  QUESTIONS_HINT,
  ORDER_QUESTION,
  POSTAL_CODE_QUESTION,
  takeTurn,
  type Cart,
  type ConversationDependencies,
  type ConversationState,
  type Reply,
  type Turn,
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
  product("8", "Cerveza Patagonia 730 ml", 3500, packaged("volume", 730)),
  product("9", "Vino tinto Toro 1 l", 2500, packaged("volume", 1000)),
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
  replies?: Partial<ReadReplyOutput>[];
  unavailableAlone?: string[];
  unavailableInCart?: string[];
  savings?: Record<string, number>;
  deliveries?: Record<string, Delivery>;
};

const conversation = ({
  items = [],
  ignoredPreference = false,
  answers = {},
  replies = [],
  unavailableAlone = [],
  unavailableInCart = [],
  savings = {},
  deliveries = {},
}: Script = {}) => {
  const calls: string[] = [];
  const signals: AbortSignal[] = [];
  const simulations: SimulationRequest[] = [];
  const readInputs: ReadReplyInput[] = [];
  const fitted: string[] = [];
  const pendingReplies = [...replies];
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
        fitted.push(input.item.original);
        return Promise.resolve({
          fits: input.matches.map((_match, index) => index + 1),
          closest: [],
          note: null,
          question: null,
          ...answers[input.item.product]?.(input),
        });
      },
      readReply: (input, signal) => {
        seen("readReply", signal);
        readInputs.push(input);
        return Promise.resolve({
          entries: [],
          newLines: [],
          ignoredPreference: false,
          ...pendingReplies.shift(),
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
  return { deps, calls, signals, simulations, readInputs, fitted };
};

const ordering: ConversationState = { stage: "order", postalCode: "1425" };

const cartOf = async (script: Script, texts = ["pedido"]): Promise<Cart> => {
  const { deps } = conversation(script);
  let state: ConversationState = ordering;
  let reply: Reply | null = null;
  for (const text of texts) ({ state, reply } = await takeTurn(state, text, deps));
  assert.equal(reply?.kind, "cart");
  if (reply?.kind !== "cart") throw new Error("no cart");
  return reply.cart;
};

const run = async (script: Script, texts: string[]) => {
  const fake = conversation(script);
  const turns: Turn[] = [];
  let state: ConversationState = ordering;
  for (const text of texts) {
    const turn = await takeTurn(state, text, fake.deps);
    turns.push(turn);
    state = turn.state;
  }
  return { ...fake, turns, last: turns.at(-1)! };
};

const cartIn = (turn: Turn): Cart => {
  if (turn.reply.kind !== "cart") throw new Error(`no cart: ${JSON.stringify(turn.reply)}`);
  return turn.reply.cart;
};

const questionsIn = (turn: Turn) => {
  if (turn.reply.kind !== "questions") throw new Error(`no questions: ${turn.reply.kind}`);
  return turn.reply;
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

    it("puts each Note under its line and the Items removed and the preference after the table", async () => {
      const cart = await cartOf(
        {
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
            "queso port salut": () => ({
              fits: [1, 2],
              note: "Tomé 'porsalud' como Port Salut.",
            }),
            fernet: () => ({
              fits: [],
              closest: [1],
              question: "No hay fernet chico. ¿Te sirve el de 750 ml?",
            }),
          },
          replies: [{ entries: [{ item: 1, kind: "drop" }] }],
          savings: { "5": 500 },
        },
        ["pedido", "sacalo"],
      );
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
      assert.deepEqual(cart.notes, ["Saqué: fernet chico", IGNORED_PREFERENCE_NOTE]);
      assert.equal(cart.warning, CART_WARNING);
    });

    it("tells about an ignored card or preference even when every Item is bought", async () => {
      const cart = await cartOf({ items: [item("yerba", "yerba")], ignoredPreference: true });
      assert.deepEqual(cart.notes, [IGNORED_PREFERENCE_NOTE]);
      assert.equal(cart.warning, CART_WARNING);
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

  describe("questions", () => {
    const carbonQuestion = "No hay carbón en bolsa. ¿Te sirve alguno de estos?";
    const yerbaAndCarbon: Script = {
      items: [item("yerba", "yerba"), item("1 bolsa de carbon", "carbón en bolsa")],
      answers: {
        "carbón en bolsa": () => ({ fits: [], closest: [1], question: carbonQuestion }),
      },
    };
    const carbonAsked = [
      "Tengo una pregunta:",
      `1. ${carbonQuestion}\n   1) Carbón vegetal Carbocor 4 kg ($5000.00)`,
      QUESTIONS_HINT,
    ].join("\n\n");

    it("asks about an Item with no Fit with its Alternatives and simulates nothing", async () => {
      const { last, simulations } = await run(yerbaAndCarbon, ["yerba y carbón"]);
      assert.deepEqual(questionsIn(last), {
        kind: "questions",
        text: carbonAsked,
        questions: [{ number: 1, options: ["Carbón vegetal Carbocor 4 kg"] }],
      });
      assert.equal(last.state.stage, "questions");
      assert.deepEqual(simulations, []);
    });

    it("numbers every open question and its Alternatives", async () => {
      const { last } = await run(
        {
          items: [item("carbón", "carbón"), item("queso", "queso port salut")],
          answers: {
            carbón: () => ({ fits: [], closest: [], question: "¿Qué carbón?" }),
            "queso port salut": () => ({ fits: [], closest: [2, 1], question: "¿Cuál queso?" }),
          },
        },
        ["carbón y queso"],
      );
      assert.equal(
        questionsIn(last).text,
        [
          "Tengo unas preguntas:",
          "1. ¿Qué carbón?",
          [
            "2. ¿Cuál queso?",
            "   1) Queso Port Salut La Serenísima 500 g ($4200.00)",
            "   2) Queso Port Salut Sancor 500 g ($4000.00)",
          ].join("\n"),
          QUESTIONS_HINT,
        ].join("\n\n"),
      );
      assert.deepEqual(questionsIn(last).questions, [
        { number: 1, options: [] },
        {
          number: 2,
          options: ["Queso Port Salut La Serenísima 500 g", "Queso Port Salut Sancor 500 g"],
        },
      ]);
    });

    it("sends the asked Items and the reply to read-reply", async () => {
      const { readInputs } = await run(
        {
          ...yerbaAndCarbon,
          replies: [{ entries: [{ item: 1, kind: "choice", alternative: 1 }] }],
        },
        ["yerba y carbón", "la 1"],
      );
      assert.deepEqual(readInputs, [
        {
          items: [
            {
              kind: "asked",
              original: "1 bolsa de carbon",
              question: { text: carbonQuestion, alternatives: [catalog[5]] },
            },
          ],
          reply: "la 1",
        },
      ]);
    });

    it("buys a chosen Alternative as is with the Item's quantity, with no search or call 2", async () => {
      const { last, fitted } = await run(
        {
          items: [
            item("yerba", "yerba"),
            item("2 bolsas de carbon", "carbón en bolsa", {
              quantity: { kind: "units", count: 2 },
              size: { kind: "exact", dimension: "weight", amount: 3000 },
            }),
          ],
          answers: yerbaAndCarbon.answers,
          replies: [{ entries: [{ item: 1, kind: "choice", alternative: 1 }] }],
        },
        ["yerba y carbón", "la 1"],
      );
      const cart = cartIn(last);
      assert.deepEqual(
        cart.lines.map((line) => [line.original, line.product.itemId, line.quantity, line.notes]),
        [
          ["yerba", "1", 1, []],
          ["2 bolsas de carbon", "6", 2, []],
        ],
      );
      assert.deepEqual(fitted, ["yerba", "2 bolsas de carbon"]);
      assert.equal(last.state.stage, "done");
    });

    it("runs search and call 2 for the lines that replace an asked Item", async () => {
      const { last, fitted } = await run(
        {
          ...yerbaAndCarbon,
          replies: [
            {
              entries: [
                {
                  item: 1,
                  kind: "lines",
                  lines: [item("una Patagonia", "cerveza", { brand: "Patagonia" })],
                },
              ],
            },
          ],
        },
        ["yerba y carbón", "dale, una Patagonia"],
      );
      assert.deepEqual(linesOf(cartIn(last)), [
        ["yerba", "1"],
        ["una Patagonia", "8"],
      ]);
      assert.deepEqual(fitted, ["yerba", "1 bolsa de carbon", "una Patagonia"]);
    });

    it("removes a dropped Item with a Note after the table", async () => {
      const { last } = await run(
        { ...yerbaAndCarbon, replies: [{ entries: [{ item: 1, kind: "drop" }] }] },
        ["yerba y carbón", "sacala"],
      );
      const cart = cartIn(last);
      assert.deepEqual(linesOf(cart), [["yerba", "1"]]);
      assert.deepEqual(cart.notes, ["Saqué: 1 bolsa de carbon"]);
    });

    it("re-asks in code an Item the reply leaves out, with the same text and Alternatives", async () => {
      const { last, fitted, simulations } = await run(yerbaAndCarbon, [
        "yerba y carbón",
        "¿a qué hora llega?",
      ]);
      assert.deepEqual(questionsIn(last), {
        kind: "questions",
        text: [
          "Tengo una pregunta:",
          `1. Me falta saber de 1 bolsa de carbon: ${carbonQuestion}\n   1) Carbón vegetal Carbocor 4 kg ($5000.00)`,
          QUESTIONS_HINT,
        ].join("\n\n"),
        questions: [{ number: 1, options: ["Carbón vegetal Carbocor 4 kg"] }],
      });
      assert.deepEqual(fitted, ["yerba", "1 bolsa de carbon"]);
      assert.deepEqual(simulations, []);
    });

    it("re-asks an Item read as unanswered the same way", async () => {
      const { last } = await run(
        {
          ...yerbaAndCarbon,
          replies: [{ entries: [{ item: 1, kind: "unanswered", question: null }] }],
        },
        ["yerba y carbón", "no sé"],
      );
      assert.match(questionsIn(last).text, /Me falta saber de 1 bolsa de carbon:/);
    });

    it("drops an Item after its second question goes unanswered", async () => {
      const { last, turns } = await run(yerbaAndCarbon, ["yerba y carbón", "hola", "chau"]);
      assert.equal(turns[1]!.reply.kind, "questions");
      const cart = cartIn(last);
      assert.deepEqual(linesOf(cart), [["yerba", "1"]]);
      assert.deepEqual(cart.notes, [
        'No conseguí "1 bolsa de carbon": te pregunté 2 veces y no encontré qué llevar',
      ]);
    });

    it("spends a question on an answer that leads to no Fit and drops the Item after the second", async () => {
      const noFit = () => ({ fits: [], closest: [], question: "Tampoco hay de esa marca." });
      const toPatagonia = (original: string) => ({
        entries: [
          {
            item: 1,
            kind: "lines" as const,
            lines: [item(original, "carbón patagonia", { brand: "Patagonia" })],
          },
        ],
      });
      const { turns, last } = await run(
        {
          ...yerbaAndCarbon,
          answers: { ...yerbaAndCarbon.answers, "carbón patagonia": noFit },
          replies: [toPatagonia("uno Patagonia"), toPatagonia("Patagonia te dije")],
        },
        ["yerba y carbón", "uno Patagonia", "Patagonia te dije"],
      );
      assert.equal(
        questionsIn(turns[1]!).text,
        ["Tengo una pregunta:", "1. Tampoco hay de esa marca.", QUESTIONS_HINT].join("\n\n"),
      );
      assert.deepEqual(cartIn(last).notes, [
        'No conseguí "Patagonia te dije": te pregunté 2 veces y no encontré qué llevar',
      ]);
    });

    it("runs new lines of the reply as new Items with their own questions", async () => {
      const { last } = await run(
        {
          ...yerbaAndCarbon,
          answers: {
            ...yerbaAndCarbon.answers,
            fernet: () => ({ fits: [], closest: [1], question: "¿Te sirve el de 750 ml?" }),
          },
          replies: [
            {
              entries: [{ item: 1, kind: "choice", alternative: 1 }],
              newLines: [item("un vino tinto", "vino tinto"), item("fernet chico", "fernet")],
            },
            { entries: [{ item: 1, kind: "choice", alternative: 1 }] },
          ],
        },
        ["yerba y carbón", "la 1, y agregá un vino tinto y un fernet chico", "dale"],
      );
      assert.deepEqual(linesOf(cartIn(last)), [
        ["yerba", "1"],
        ["1 bolsa de carbon", "6"],
        ["un vino tinto", "9"],
        ["fernet chico", "7"],
      ]);
    });

    it("keeps asking until the last question is answered, then delivers the cart", async () => {
      const { turns, last, readInputs } = await run(
        {
          items: [
            item("yerba", "yerba"),
            item("carbón", "carbón"),
            item("queso", "queso port salut"),
          ],
          answers: {
            carbón: () => ({ fits: [], closest: [1], question: "¿Este carbón?" }),
            "queso port salut": () => ({ fits: [], closest: [1, 2], question: "¿Cuál queso?" }),
          },
          replies: [
            { entries: [{ item: 2, kind: "choice", alternative: 2 }] },
            { entries: [{ item: 1, kind: "choice", alternative: 1 }] },
          ],
        },
        ["yerba, carbón y queso", "el queso el 2", "el carbón dale"],
      );
      assert.deepEqual(questionsIn(turns[1]!).questions, [
        { number: 1, options: ["Carbón vegetal Carbocor 4 kg"] },
      ]);
      assert.deepEqual(
        readInputs.map(({ items }) => items.map(({ original }) => original)),
        [["carbón", "queso"], ["carbón"]],
      );
      assert.deepEqual(linesOf(cartIn(last)), [
        ["yerba", "1"],
        ["carbón", "6"],
        ["queso", "5"],
      ]);
    });

    it("tells about a card or preference written in a reply", async () => {
      const { last } = await run(
        {
          ...yerbaAndCarbon,
          replies: [{ entries: [{ item: 1, kind: "drop" }], ignoredPreference: true }],
        },
        ["yerba y carbón", "sacala, pago con Visa"],
      );
      assert.deepEqual(cartIn(last).notes, ["Saqué: 1 bolsa de carbon", IGNORED_PREFERENCE_NOTE]);
    });

    it("asks the open questions again when the reply is empty", async () => {
      const { turns, calls } = await run(yerbaAndCarbon, ["yerba y carbón", "  "]);
      assert.deepEqual(turns[1], turns[0]);
      assert.ok(!calls.includes("readReply"));
    });

    it("reports understanding the answer before choosing products for its lines", async () => {
      const fake = conversation({
        ...yerbaAndCarbon,
        replies: [{ entries: [{ item: 1, kind: "drop" }], newLines: [item("vino", "vino tinto")] }],
      });
      const { state } = await takeTurn(ordering, "yerba y carbón", fake.deps);
      const events: StepEvent[] = [];
      await takeTurn(state, "sacala y agregá vino", fake.deps, (event) => events.push(event));
      assert.deepEqual(
        events.filter(({ status }) => status === "started").map(({ step }) => step),
        [
          { kind: "understand-answer" },
          { kind: "choose-products", original: "vino" },
          { kind: "simulate-cart" },
        ],
      );
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
