import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { Item } from "../order-matching/item.ts";
import type { ItemMatch } from "../order-matching/match-items.ts";
import { checkReadReply, type ReadReplyOutput } from "../order-matching/read-reply.ts";
import { candidateOf, candidatesFor, type Candidate } from "../product-selection/candidates.ts";
import {
  CART_WARNING,
  type Bought,
  type CartLine,
  type SimulatedCart,
} from "../product-selection/cart.ts";
import {
  IGNORED_PREFERENCE_NOTE,
  MAX_QUESTIONS,
  QUESTIONS_HINT,
  applyReply,
  nextStep,
  replyItems,
  startOrder,
  takeCart,
  withMatches,
  type Cart,
  type CartTaken,
  type NextStep,
  type Order,
} from "./order.ts";

const product = (itemId: string, name: string, price: number | null = 1000): CatalogProduct => ({
  productId: `p${itemId}`,
  itemId,
  name,
  brand: null,
  department: "Almacén",
  tipo: null,
  price,
  inStock: true,
  sale: { kind: "packaged", size: { dimension: "weight", amount: 1000 } },
  teasers: [],
});

const yerba = product("1", "Yerba mate Playadito 1 kg", 3000);
const carbon = product("6", "Carbón vegetal Carbocor 4 kg", 5000);
const sancor = product("4", "Queso Port Salut Sancor 500 g", 4000);
const serenisima = product("5", "Queso Port Salut La Serenísima 500 g", null);
const vino = product("9", "Vino tinto Toro 1 l", 2500);

const item = (original: string, wanted = original): Item => ({
  original,
  product: wanted,
  brand: null,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
});

const fits = (line: Item, ...products: CatalogProduct[]): ItemMatch => ({
  item: line,
  matches: products,
  fits: products,
  note: null,
  question: null,
});

const asks = (line: Item, text: string, ...alternatives: CatalogProduct[]): ItemMatch => ({
  item: line,
  matches: alternatives,
  fits: [],
  note: null,
  question: { text, alternatives },
});

const read = (order: Order, output: Partial<ReadReplyOutput>): ReadReplyOutput =>
  checkReadReply(
    { items: replyItems(order), reply: "" },
    { entries: [], newLines: [], ignoredPreference: false, ...output },
  );

const questionsOf = (step: NextStep) => {
  if (step.kind !== "questions") throw new Error(`no questions: ${step.kind}`);
  return step;
};

const boughtOf = (step: NextStep) => {
  if (step.kind !== "buy") throw new Error(`nothing to buy: ${step.kind}`);
  return step.items.map(({ toBuy }) => [
    toBuy.original,
    toBuy.candidates.map(({ product: bought }) => bought.itemId),
  ]);
};

const yerbaLine = item("yerba");
const carbonLine = item("1 bolsa de carbon", "carbón en bolsa");
const carbonQuestion = "No hay carbón en bolsa. ¿Te sirve alguno de estos?";
const yerbaAndCarbon = () =>
  startOrder("1425", [fits(yerbaLine, yerba), asks(carbonLine, carbonQuestion, carbon)], false);

const inCartOrder = (lines: Item[], products: CatalogProduct[]): Order => ({
  postalCode: "1425",
  items: lines.map((line, index) => ({
    kind: "in-cart",
    item: line,
    candidate: candidateOf(line, products[index]!),
    reason: "Es el más barato",
    questionsSpent: 0,
  })),
  dropped: [],
  removed: [],
  ignoredPreference: false,
  cartShown: true,
});

const applying = (order: Order, output: Partial<ReadReplyOutput>) =>
  applyReply(order, read(order, output));

const replied = (order: Order, output: Partial<ReadReplyOutput>, matched: ItemMatch[] = []) =>
  withMatches(applying(order, output).order, matched);

const lineFor = (original: string, { product: bought, quantity }: Candidate, notes: string[]) => {
  const price = bought.price ?? 0;
  const line: CartLine = {
    original,
    product: bought,
    quantity,
    unitPrice: price,
    total: price * quantity,
    reason: "Es el más barato por kilo.",
    notes,
  };
  return line;
};

type Simulated = { notGot?: Record<string, string>; notes?: Record<string, string[]> };

const simulatedFor = (order: Order, { notGot = {}, notes = {} }: Simulated = {}): SimulatedCart => {
  const step = nextStep(order);
  if (step.kind !== "buy") throw new Error(`nothing to buy: ${step.kind}`);
  const bought = step.items.map(({ toBuy }): Bought => {
    const note = notGot[toBuy.original];
    if (note !== undefined) return { kind: "not-got", note };
    return {
      kind: "bought",
      line: lineFor(toBuy.original, toBuy.candidates[0]!, notes[toBuy.original] ?? []),
    };
  });
  return { bought, total: 9999, cartLink: "cart:link" };
};

const taken = (order: Order, simulated: Simulated = {}) =>
  takeCart(order, simulatedFor(order, simulated));

const orderOf = ({ state }: CartTaken): Order => {
  const { stage: _stage, ...order } = state;
  return order;
};

const marksOf = (cart: Cart) =>
  cart.lines.map((line) => [line.original, line.product.itemId, line.mark]);

describe("Order", () => {
  describe("questions", () => {
    it("asks about an Item with no Fit with its Alternatives", () => {
      const order = yerbaAndCarbon();
      assert.deepEqual(nextStep(order), {
        kind: "questions",
        text: [
          "Tengo una pregunta:",
          `1. ${carbonQuestion}\n   1) Carbón vegetal Carbocor 4 kg ($5000.00)`,
          QUESTIONS_HINT,
        ].join("\n\n"),
        questions: [{ number: 1, options: ["Carbón vegetal Carbocor 4 kg"] }],
      });
    });

    it("numbers every open question and its Alternatives, with no price when the snapshot has none", () => {
      const order = startOrder(
        "1425",
        [
          asks(item("carbón"), "¿Qué carbón?"),
          asks(item("queso"), "¿Cuál queso?", serenisima, sancor),
        ],
        false,
      );
      assert.deepEqual(questionsOf(nextStep(order)), {
        kind: "questions",
        text: [
          "Tengo unas preguntas:",
          "1. ¿Qué carbón?",
          [
            "2. ¿Cuál queso?",
            "   1) Queso Port Salut La Serenísima 500 g",
            "   2) Queso Port Salut Sancor 500 g ($4000.00)",
          ].join("\n"),
          QUESTIONS_HINT,
        ].join("\n\n"),
        questions: [
          { number: 1, options: [] },
          {
            number: 2,
            options: ["Queso Port Salut La Serenísima 500 g", "Queso Port Salut Sancor 500 g"],
          },
        ],
      });
    });

    it("lists only the asked Items and the Items in the cart for read-reply, numbered from 1", () => {
      const order: Order = {
        ...inCartOrder([yerbaLine], [yerba]),
        items: [...inCartOrder([yerbaLine], [yerba]).items, ...yerbaAndCarbon().items],
      };
      assert.deepEqual(replyItems(order), [
        { kind: "bought", original: "yerba", product: yerba },
        {
          kind: "asked",
          original: "1 bolsa de carbon",
          question: { text: carbonQuestion, alternatives: [carbon] },
        },
      ]);
    });

    it("buys a chosen Alternative as is, with nothing to match", () => {
      const applied = applying(yerbaAndCarbon(), {
        entries: [{ item: 1, kind: "choice", alternative: 1 }],
      });
      assert.deepEqual(applied.toMatch, []);
      const order = withMatches(applied.order, []);
      assert.deepEqual(boughtOf(nextStep(order)), [
        ["yerba", ["1"]],
        ["1 bolsa de carbon", ["6"]],
      ]);
      assert.deepEqual(
        order.items.map(({ kind }) => kind),
        ["ready", "ready"],
      );
    });

    it("hands out the lines that replace an asked Item and takes their matches back in its place", () => {
      const patagonia = item("una Patagonia", "cerveza");
      const applied = applying(yerbaAndCarbon(), {
        entries: [{ item: 1, kind: "lines", lines: [patagonia] }],
      });
      assert.deepEqual(applied.toMatch, [patagonia]);
      const order = withMatches(applied.order, [fits(patagonia, vino)]);
      assert.deepEqual(boughtOf(nextStep(order)), [
        ["yerba", ["1"]],
        ["una Patagonia", ["9"]],
      ]);
    });

    it("removes a dropped Item with a Note", () => {
      const order = replied(yerbaAndCarbon(), { entries: [{ item: 1, kind: "drop" }] });
      assert.deepEqual(boughtOf(nextStep(order)), [["yerba", ["1"]]]);
      assert.deepEqual(order.removed, ["Saqué: 1 bolsa de carbon"]);
    });

    it("re-asks an unanswered Item once with the same question, then drops it with a Note", () => {
      const unanswered = { entries: [{ item: 1, kind: "unanswered" as const, question: null }] };
      const once = replied(yerbaAndCarbon(), unanswered);
      assert.equal(
        questionsOf(nextStep(once)).text,
        [
          "Tengo una pregunta:",
          `1. Me falta saber de 1 bolsa de carbon: ${carbonQuestion}\n   1) Carbón vegetal Carbocor 4 kg ($5000.00)`,
          QUESTIONS_HINT,
        ].join("\n\n"),
      );
      const twice = replied(once, unanswered);
      assert.deepEqual(boughtOf(nextStep(twice)), [["yerba", ["1"]]]);
      assert.deepEqual(twice.dropped, [
        `No conseguí "1 bolsa de carbon": te pregunté ${String(MAX_QUESTIONS)} veces y no encontré qué llevar`,
      ]);
    });

    it("spends a question on an answer that leads to no Fit and drops the Item after the second", () => {
      const first = item("uno Patagonia", "carbón patagonia");
      const second = item("Patagonia te dije", "carbón patagonia");
      const once = replied(
        yerbaAndCarbon(),
        { entries: [{ item: 1, kind: "lines", lines: [first] }] },
        [asks(first, "Tampoco hay de esa marca.")],
      );
      assert.equal(
        questionsOf(nextStep(once)).text,
        ["Tengo una pregunta:", "1. Tampoco hay de esa marca.", QUESTIONS_HINT].join("\n\n"),
      );
      const twice = replied(once, { entries: [{ item: 1, kind: "lines", lines: [second] }] }, [
        asks(second, "Tampoco hay de esa marca."),
      ]);
      assert.deepEqual(boughtOf(nextStep(twice)), [["yerba", ["1"]]]);
      assert.deepEqual(twice.dropped, [
        'No conseguí "Patagonia te dije": te pregunté 2 veces y no encontré qué llevar',
      ]);
    });

    it("matches new lines of the reply after the replaced Items and keeps them in that order", () => {
      const patagonia = item("una Patagonia", "cerveza");
      const wine = item("un vino tinto", "vino tinto");
      const fernet = item("fernet chico", "fernet");
      const applied = applying(yerbaAndCarbon(), {
        entries: [{ item: 1, kind: "lines", lines: [patagonia] }],
        newLines: [wine, fernet],
      });
      assert.deepEqual(applied.toMatch, [patagonia, wine, fernet]);
      const order = withMatches(applied.order, [
        fits(patagonia, vino),
        fits(wine, vino),
        asks(fernet, "¿Te sirve el de 750 ml?", carbon),
      ]);
      assert.deepEqual(
        order.items.map(({ kind, item: line }) => [kind, line.original]),
        [
          ["ready", "yerba"],
          ["ready", "una Patagonia"],
          ["ready", "un vino tinto"],
          ["asked", "fernet chico"],
        ],
      );
      assert.deepEqual(
        order.items.map((entry) => (entry.kind === "in-cart" ? null : entry.mark)),
        [null, null, null, null],
      );
    });

    it("keeps an ignored card or preference from the order or from any reply", () => {
      assert.equal(replied(yerbaAndCarbon(), { ignoredPreference: true }).ignoredPreference, true);
      const ignored = startOrder("1425", [asks(carbonLine, carbonQuestion, carbon)], true);
      assert.equal(replied(ignored, {}).ignoredPreference, true);
    });

    it("refuses match results that do not pair with the Items given out", () => {
      const applied = applying(yerbaAndCarbon(), { newLines: [item("vino")] });
      assert.throws(() => withMatches(applied.order, []), /no match result for "vino"/u);
      assert.throws(
        () => withMatches(applied.order, [fits(item("vino"), vino), fits(item("otro"), vino)]),
        /1 match results more than the Items given out/u,
      );
    });
  });

  describe("corrections", () => {
    const coca = item("coca zero", "coca cola zero");
    const cart = () => inCartOrder([yerbaLine, coca, item("queso")], [yerba, vino, sancor]);

    it("buys Items in the cart again as kept, with their product and reason", () => {
      const step = nextStep(cart());
      assert.equal(step.kind, "buy");
      if (step.kind !== "buy") return;
      assert.deepEqual(
        step.items.map(({ toBuy, keptReason, mark }) => [
          toBuy.original,
          toBuy.candidates.map(({ product: bought }) => bought.itemId),
          toBuy.kept,
          keptReason,
          mark,
        ]),
        [
          ["yerba", ["1"], true, "Es el más barato", null],
          ["coca zero", ["9"], true, "Es el más barato", null],
          ["queso", ["4"], true, "Es el más barato", null],
        ],
      );
    });

    it("hands out only the corrected Items and marks them as changed", () => {
      const smaller = item("la coca de 1,5", "coca cola zero");
      const applied = applying(cart(), { entries: [{ item: 2, kind: "lines", lines: [smaller] }] });
      assert.deepEqual(applied.toMatch, [smaller]);
      const order = withMatches(applied.order, [fits(smaller, vino)]);
      assert.deepEqual(
        order.items.map((entry) => [
          entry.kind,
          entry.item.original,
          entry.kind === "in-cart" ? null : entry.mark,
        ]),
        [
          ["in-cart", "yerba", null],
          ["ready", "la coca de 1,5", "changed"],
          ["in-cart", "queso", null],
        ],
      );
    });

    it("removes an Item the Owner drops from the cart with a Note", () => {
      const order = replied(cart(), { entries: [{ item: 3, kind: "drop" }] });
      assert.deepEqual(boughtOf(nextStep(order)), [
        ["yerba", ["1"]],
        ["coca zero", ["9"]],
      ]);
      assert.deepEqual(order.removed, ["Saqué: queso"]);
    });

    it("marks Items added after the cart as new, and Items added before it with no mark", () => {
      const wine = item("vino");
      const after = replied(cart(), { newLines: [wine] }, [fits(wine, vino)]);
      const before = replied(
        yerbaAndCarbon(),
        { newLines: [wine], entries: [{ item: 1, kind: "drop" }] },
        [fits(wine, vino)],
      );
      const markOf = (order: Order) => {
        const added = order.items.at(-1)!;
        return added.kind === "in-cart" ? null : added.mark;
      };
      assert.equal(markOf(after), "new");
      assert.equal(markOf(before), null);
    });

    it("reads a Correction together with an answer in the same reply", () => {
      const fernet = item("fernet chico", "fernet");
      const asked = replied(cart(), { newLines: [fernet] }, [
        asks(fernet, "No hay fernet chico. ¿Te sirve este?", carbon),
      ]);
      assert.deepEqual(
        replyItems(asked).map(({ kind, original }) => [kind, original]),
        [
          ["bought", "yerba"],
          ["bought", "coca zero"],
          ["bought", "queso"],
          ["asked", "fernet chico"],
        ],
      );
      const order = replied(asked, {
        entries: [
          { item: 3, kind: "drop" },
          { item: 4, kind: "choice", alternative: 1 },
        ],
      });
      assert.deepEqual(boughtOf(nextStep(order)), [
        ["yerba", ["1"]],
        ["coca zero", ["9"]],
        ["fernet chico", ["6"]],
      ]);
      assert.deepEqual(order.removed, ["Saqué: queso"]);
    });

    describe("an ambiguous reference", () => {
      const whichCoca = "¿Cuál coca querés de 1,5, la zero o la normal?";
      const ambiguous = {
        entries: [{ item: 2, kind: "unanswered" as const, question: whichCoca }],
      };

      it("asks which Item with no Alternatives and lists the asked Item for the next reply", () => {
        const order = replied(cart(), ambiguous);
        assert.deepEqual(questionsOf(nextStep(order)), {
          kind: "questions",
          text: ["Tengo una pregunta:", `1. ${whichCoca}`, QUESTIONS_HINT].join("\n\n"),
          questions: [{ number: 1, options: [] }],
        });
        assert.deepEqual(replyItems(order)[1], {
          kind: "asked",
          original: "coca zero",
          question: { text: whichCoca, alternatives: [] },
        });
      });

      it("puts the asked Item back in the cart as it was when the answer leaves it out", () => {
        const order = replied(replied(cart(), ambiguous), {});
        assert.deepEqual(
          order.items,
          cart().items.map((entry, index) =>
            index === 1 ? { ...entry, questionsSpent: 1 } : entry,
          ),
        );
      });

      it("spends one of the Item's questions and keeps it in the cart once none is left", () => {
        let order = cart();
        const kinds: string[] = [];
        for (let turn = 0; turn < 3; turn += 1) {
          order = replied(order, ambiguous);
          kinds.push(nextStep(order).kind);
          order = replied(order, {});
        }
        assert.deepEqual(kinds, ["questions", "questions", "buy"]);
        assert.deepEqual(boughtOf(nextStep(order)), [
          ["yerba", ["1"]],
          ["coca zero", ["9"]],
          ["queso", ["4"]],
        ]);
      });
    });
  });

  describe("cart", () => {
    it("shows the bought lines with the total, the link and the warning, and keeps them in the cart", () => {
      const { state, cart } = taken(startOrder("1425", [fits(yerbaLine, yerba)], false));
      const [candidate] = candidatesFor(yerbaLine, [yerba]);
      assert.deepEqual(cart, {
        postalCode: "1425",
        lines: [{ ...lineFor("yerba", candidate!, []), mark: null }],
        total: 9999,
        notes: [],
        warning: CART_WARNING,
        cartLink: "cart:link",
      });
      assert.deepEqual(state, {
        stage: "cart",
        postalCode: "1425",
        items: [
          {
            kind: "in-cart",
            item: yerbaLine,
            candidate,
            reason: "Es el más barato por kilo.",
            questionsSpent: 0,
          },
        ],
        dropped: [],
        removed: [],
        ignoredPreference: false,
        cartShown: true,
      });
    });

    it("puts the Notes under the table in order: dropped Items, Items not got, removed Items, the ignored preference", () => {
      const queso = item("queso");
      const wine = item("vino");
      const asking = startOrder(
        "1425",
        [
          fits(yerbaLine, yerba),
          asks(carbonLine, carbonQuestion, carbon),
          asks(queso, "¿Cuál queso?", sancor, serenisima),
          fits(wine, vino),
        ],
        true,
      );
      const order = replied(replied(asking, { entries: [{ item: 2, kind: "drop" }] }), {});
      const result = taken(order, { notGot: { yerba: 'No conseguí "yerba": no hay ninguno' } });
      assert.deepEqual(result.cart.notes, [
        'No conseguí "1 bolsa de carbon": te pregunté 2 veces y no encontré qué llevar',
        'No conseguí "yerba": no hay ninguno',
        "Saqué: queso",
        IGNORED_PREFERENCE_NOTE,
      ]);
      assert.deepEqual(marksOf(result.cart), [["vino", "9", null]]);
      assert.deepEqual(
        orderOf(result).items.map((entry) => [entry.kind, entry.item.original]),
        [["in-cart", "vino"]],
      );
      assert.deepEqual(
        [result.state.dropped, result.state.removed, result.state.ignoredPreference],
        [[], [], false],
      );
    });

    it("marks corrected lines as changed and added ones as new, and shows kept Items with their reason and no Notes", () => {
      const smaller = item("la coca de 1,5", "coca cola zero");
      const wine = item("vino");
      const order = replied(
        inCartOrder([yerbaLine, item("coca zero"), item("queso")], [yerba, carbon, sancor]),
        { entries: [{ item: 2, kind: "lines", lines: [smaller] }], newLines: [wine] },
        [fits(smaller, serenisima), fits(wine, vino)],
      );
      const { cart } = taken(order, {
        notes: { yerba: ["Tomé 'yerba' como yerba mate."], "la coca de 1,5": ["Llevo 1,5 l"] },
      });
      assert.deepEqual(
        cart.lines.map(({ original, mark, reason, notes }) => [original, mark, reason, notes]),
        [
          ["yerba", null, "Es el más barato", []],
          ["la coca de 1,5", "changed", "Es el más barato por kilo.", ["Llevo 1,5 l"]],
          ["queso", null, "Es el más barato", []],
          ["vino", "new", "Es el más barato por kilo.", []],
        ],
      );
    });

    it("tracks that the cart was shown: lines added after it are new once, then kept with no mark", () => {
      const wine = item("vino");
      const first = taken(startOrder("1425", [fits(yerbaLine, yerba)], false));
      const second = taken(replied(orderOf(first), { newLines: [wine] }, [fits(wine, vino)]));
      const third = taken(replied(orderOf(second), {}));
      assert.deepEqual(
        [first, second, third].map(({ cart }) => marksOf(cart)),
        [
          [["yerba", "1", null]],
          [
            ["yerba", "1", null],
            ["vino", "9", "new"],
          ],
          [
            ["yerba", "1", null],
            ["vino", "9", null],
          ],
        ],
      );
    });

    it("refuses a cart while a question is open", () => {
      const order = yerbaAndCarbon();
      assert.throws(
        () => takeCart(order, { bought: [], total: 0, cartLink: null }),
        /a cart taken while the Order still asks questions/,
      );
    });

    it("refuses cart results that do not pair with the Items to buy", () => {
      const order = startOrder("1425", [fits(yerbaLine, yerba)], false);
      assert.throws(
        () => takeCart(order, { bought: [], total: 0, cartLink: null }),
        /0 cart results for 1 Items to buy/,
      );
    });
  });

  describe("start", () => {
    it("starts with every matched Item ready or asked, in the order of the order", () => {
      const order = startOrder(
        "1425",
        [fits(yerbaLine, yerba), asks(carbonLine, carbonQuestion, carbon)],
        true,
      );
      assert.deepEqual(order, {
        postalCode: "1425",
        items: [
          {
            kind: "ready",
            item: yerbaLine,
            toBuy: {
              original: "yerba",
              note: null,
              candidates: candidatesFor(yerbaLine, [yerba]),
              kept: false,
            },
            questionsSpent: 0,
            mark: null,
          },
          {
            kind: "asked",
            item: carbonLine,
            question: { text: carbonQuestion, alternatives: [carbon] },
            questionsSpent: 1,
            reasked: false,
            mark: null,
            inCart: null,
          },
        ],
        dropped: [],
        removed: [],
        ignoredPreference: true,
        cartShown: false,
      });
    });
  });
});
