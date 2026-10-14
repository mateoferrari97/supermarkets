import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type {
  Item,
  Llm,
  MapAnswerInput,
  MapAnswerOutput,
  ResolveItemInput,
  ResolveItemOutput,
} from "./llm.ts";
import {
  answerQuestions,
  resolveOrder,
  type CatalogProduct,
  type OrderItem,
  type OrderResolution,
} from "./resolve-order.ts";

const vocabulary = {
  groups: [
    {
      id: "grupo-leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera" },
        { id: "leche-descremada", name: "Leche descremada" },
        { id: "leche-chocolatada", name: "Leche chocolatada" },
      ],
    },
    { id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] },
    { id: "grupo-gaseosa", name: "Gaseosa", productTypes: [{ id: "gaseosa", name: "Gaseosa" }] },
  ],
};

const mapping = {
  "Leche entera": "leche-entera",
  "Leche descremada": "leche-descremada",
  "Leche chocolatada": "leche-chocolatada",
  Yerba: "yerba",
  Gaseosa: "gaseosa",
  "Leche balsámica": null,
};

const product = (name: string, brand: string | null, tipo: string | null, inStock = true) => ({
  name,
  brand,
  tipo,
  inStock,
});

const products: CatalogProduct[] = [
  product("Leche entera La Serenísima 1 l", "La Serenísima", "Leche entera"),
  product("Leche entera La Serenísima sachet 1 l", "La Serenísima", "Leche entera"),
  product("Leche descremada Sancor 1 l", "Sancor", "Leche descremada"),
  product("Leche chocolatada Cindor 1 l", "Cindor", "Leche chocolatada"),
  product("Yerba mate Playadito 1 kg", "Playadito", "Yerba"),
  product("Yerba mate Playadito 500 g", "Playadito", "Yerba"),
  product("Gaseosa cola Coca Cola sabor original 2,25 lts", "Coca Cola", "Gaseosa"),
  product("Gaseosa cola Coca Cola sabor original 1,5 lts", "Coca Cola", "Gaseosa"),
  product("Gaseosa cola Coca Cola light 1,5 lts", "Coca Cola", "Gaseosa"),
  product("Gaseosa cola Coca Cola sabor original 354 ml", "Coca Cola", "Gaseosa"),
  product("Gaseosa cola Coca Cola sabor original 3 lts", "Coca Cola", "Gaseosa", false),
  product("Gaseosa cola Pepsi 2 lts", "Pepsi", "Gaseosa"),
  product("Leche balsámica corporal 200 ml", "Nivea", "Leche balsámica"),
  product("Huevos blancos x 12", null, null),
];

const item = (phrase: string, overrides: Partial<Item> = {}): Item => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  ...overrides,
});

const type = (id: string) => {
  const found = vocabulary.groups
    .flatMap(({ productTypes }) => productTypes)
    .find((ref) => ref.id === id);
  return found!;
};

const resolved = (phrase: string, id: string, overrides: Partial<Item> = {}): OrderItem => ({
  ...item(phrase, overrides),
  productTypes: [type(id)],
  question: null,
});

const optionIds = (orderItem: OrderItem | undefined) =>
  orderItem?.question?.kind === "productType" ? orderItem.question.options.map(({ id }) => id) : [];

const yerba: ResolveItemOutput = { kind: "match", candidates: ["yerba"] };
const leche: ResolveItemOutput = { kind: "match", candidates: ["grupo-leche"] };
const liviana: ResolveItemOutput = {
  kind: "ambiguous",
  candidates: ["leche-descremada", "leche-entera"],
};
const gaseosa: ResolveItemOutput = { kind: "match", candidates: ["gaseosa"] };
const nothing: ResolveItemOutput = { kind: "none", candidates: [] };

type Script = {
  items: Item[];
  answers: Record<string, ResolveItemOutput>;
  rewordings?: Record<string, string>;
  replies?: Record<string, MapAnswerOutput>;
  paymentCard?: string | null;
  preference?: string | null;
};

type Seen = { resolved: ResolveItemInput[]; reworded: ResolveItemInput[]; asked: MapAnswerInput[] };

const scripted = <T>(table: Record<string, T>, key: string, task: string): Promise<T> => {
  const value = table[key];
  if (value === undefined) return Promise.reject(new Error(`no scripted ${task} for ${key}`));
  return Promise.resolve(value);
};

const fakeLlm = ({
  items,
  answers,
  rewordings = {},
  replies = {},
  paymentCard = null,
  preference = null,
}: Script) => {
  const seen: Seen = { resolved: [], reworded: [], asked: [] };
  const llm: Llm = {
    splitOrder: () => Promise.resolve({ items, paymentCard, preference }),
    resolveItem: (input) => {
      seen.resolved.push(input);
      return scripted(answers, input.item.phrase, "answer");
    },
    rewordItem: async (input) => {
      seen.reworded.push(input);
      return { phrase: await scripted(rewordings, input.item.phrase, "rewording") };
    },
    mapAnswer: (input) => {
      seen.asked.push(input);
      return scripted(replies, input.answer, "reply");
    },
    translatePreference: () => Promise.reject(new Error("order resolution never translates")),
  };
  return { llm, seen };
};

const dependencies = (llm: Llm) => ({ products, vocabulary, mapping, llm });

const run = (script: Script) => {
  const { llm, seen } = fakeLlm(script);
  return resolveOrder("pedido", dependencies(llm)).then((resolution) => ({ resolution, seen }));
};

const runAndAnswer = async (script: Script, ...answers: string[]) => {
  const { llm, seen } = fakeLlm(script);
  let resolution: OrderResolution = await resolveOrder("pedido", dependencies(llm));
  for (const answer of answers)
    resolution = await answerQuestions(resolution, answer, dependencies(llm));
  return { resolution, seen };
};

const reply = (...answers: Partial<MapAnswerOutput["answers"][number]>[]): MapAnswerOutput => ({
  answers: answers.map((answer) => ({
    question: 1,
    kind: "chosen",
    options: [],
    phrase: null,
    ...answer,
  })),
});

describe("resolveOrder", () => {
  it("resolves clear Items with their quantity, brand and terms", async () => {
    const lecheEntera = item("leche entera", {
      quantity: 2,
      brand: "La Serenísima",
      terms: ["1 l"],
    });
    const { resolution } = await run({
      items: [item("yerba"), lecheEntera],
      answers: { yerba, "leche entera": { kind: "match", candidates: ["leche-entera"] } },
    });
    assert.deepEqual(resolution, {
      items: [
        resolved("yerba", "yerba"),
        resolved("leche entera", "leche-entera", {
          quantity: 2,
          brand: "La Serenísima",
          terms: ["1 l"],
        }),
      ],
      paymentCard: null,
      preference: null,
      message: null,
    });
  });

  it("keeps only the Items the split returns, so exclusions never become Items", async () => {
    const { resolution } = await run({ items: [item("yerba")], answers: { yerba } });
    assert.deepEqual(
      resolution.items.map(({ phrase }) => phrase),
      ["yerba"],
    );
  });

  it("gives the LLM evidence from mapped products only, brand matches first", async () => {
    const { seen } = await run({
      items: [item("leche", { brand: "Cindor" })],
      answers: { leche: { kind: "match", candidates: ["leche-chocolatada"] } },
    });
    const evidence = seen.resolved[0]!.evidence;
    assert.deepEqual(evidence[0], {
      product: "Leche chocolatada Cindor 1 l",
      productTypeId: "leche-chocolatada",
      productTypeName: "Leche chocolatada",
    });
    assert.ok(evidence.every(({ product }) => !product.includes("balsámica")));
  });

  it("drops invented ids and treats an answer left without known ids as no match", async () => {
    const { resolution } = await run({
      items: [item("yerba"), item("dulce de leche")],
      answers: {
        yerba: { kind: "match", candidates: ["yerba-mate-inventada", "yerba"] },
        "dulce de leche": { kind: "match", candidates: ["dulce-de-leche"] },
      },
      rewordings: { "dulce de leche": "dulce de leche" },
    });
    assert.deepEqual(resolution.items, [
      resolved("yerba", "yerba"),
      { ...item("dulce de leche"), productTypes: [], question: { kind: "phrase" } },
    ]);
  });

  it("asks which Product Type for a Group or an ambiguous answer", async () => {
    const { resolution } = await run({
      items: [item("leche"), item("leche liviana")],
      answers: { leche, "leche liviana": liviana },
    });
    const [group, ambiguous] = resolution.items;
    assert.equal(group?.question?.kind === "productType" && group.question.reason, "group");
    assert.deepEqual(optionIds(group), ["leche-entera", "leche-descremada", "leche-chocolatada"]);
    assert.equal(
      ambiguous?.question?.kind === "productType" && ambiguous.question.reason,
      "ambiguous",
    );
  });

  it("rewords an Item with no match exactly once and resolves the rewording", async () => {
    const { resolution, seen } = await run({
      items: [item("yerva", { quantity: 2 })],
      answers: { yerva: nothing, yerba },
      rewordings: { yerva: "yerba" },
    });
    assert.deepEqual(resolution.items, [resolved("yerva", "yerba", { quantity: 2 })]);
    assert.deepEqual(
      seen.resolved.map(({ item: { phrase } }) => phrase),
      ["yerva", "yerba"],
    );
    assert.equal(seen.reworded.length, 1);
    assert.equal(seen.resolved[1]!.evidence[0]?.productTypeId, "yerba");
  });

  it("asks about a term no product of the Product Type has, and keeps terms some product has", async () => {
    const { resolution } = await run({
      items: [
        item("leche entera", { terms: ["sachet"] }),
        item("yerba", { terms: ["sin TACC", "1 kg"] }),
        item("coca", { brand: "Coca-Cola", terms: ["2,25"] }),
      ],
      answers: {
        "leche entera": { kind: "match", candidates: ["leche-entera"] },
        yerba,
        coca: gaseosa,
      },
    });
    assert.deepEqual(
      resolution.items.map(({ question }) => question),
      [null, { kind: "term", term: "sin TACC" }, null],
    );
    assert.match(
      resolution.message ?? "",
      /1\. Para "yerba", no hay Yerba con "sin TACC"\. ¿Lo saco o lo cambio por otra cosa\?/,
    );
  });

  it("offers for a vague word only the sizes in stock of that Product Type and brand", async () => {
    const { resolution } = await run({
      items: [item("coca", { quantity: 2, brand: "Coca-Cola", vagueWords: ["grandes"] })],
      answers: { coca: gaseosa },
    });
    assert.deepEqual(resolution.items[0]?.question, {
      kind: "size",
      options: ["354 ml", "1,5 l", "2,25 l"],
    });
    assert.deepEqual(resolution.items[0]?.productTypes, [type("gaseosa")]);
    assert.equal(
      resolution.message,
      [
        "Tengo una pregunta:",
        '1. Para "coca" (grandes), ¿qué tamaño?\n   1) 354 ml\n   2) 1,5 l\n   3) 2,25 l',
        'Respondé con el número o con palabras ("la 2", "entera"), o "cualquiera" si te da igual.',
      ].join("\n\n"),
    );
  });

  it("narrows the size options by the Item's terms", async () => {
    const { resolution } = await run({
      items: [item("coca", { brand: "Coca-Cola", terms: ["light"], vagueWords: ["grande"] })],
      answers: { coca: gaseosa },
    });
    assert.deepEqual(resolution.items[0]?.question, { kind: "size", options: ["1,5 l"] });
  });

  it("asks every question of the order in one message", async () => {
    const { resolution } = await run({
      items: [item("yerba"), item("leche"), item("leche liviana"), item("pan")],
      answers: { yerba, leche, "leche liviana": liviana, pan: nothing, "pan de molde": nothing },
      rewordings: { pan: "pan de molde" },
    });
    assert.equal(
      resolution.message,
      [
        "Tengo unas preguntas:",
        '1. Para "leche", ¿cuál querés?\n   1) Leche entera\n   2) Leche descremada\n   3) Leche chocolatada',
        '2. Para "leche liviana", ¿cuál querés?\n   1) Leche descremada\n   2) Leche entera',
        '3. No encontré "pan". ¿A qué te referís?',
        'Respondé con el número o con palabras ("la 2", "entera"), o "cualquiera" si te da igual.',
      ].join("\n\n"),
    );
  });
});

describe("answerQuestions", () => {
  const script = (replies: Record<string, MapAnswerOutput>): Script => ({
    items: [item("yerba"), item("leche"), item("leche liviana")],
    answers: { yerba, leche, "leche liviana": liviana },
    replies,
  });

  const answer = (answerReply: MapAnswerOutput) =>
    runAndAnswer(script({ respuesta: answerReply }), "respuesta").then(
      ({ resolution }) => resolution,
    );

  it("offers the LLM only the questions, what they ask and their numbered options", async () => {
    const { seen } = await runAndAnswer(script({ respuesta: reply() }), "respuesta");
    assert.deepEqual(seen.asked, [
      {
        answer: "respuesta",
        questions: [
          {
            question: 1,
            phrase: "leche",
            asks: "productType",
            term: null,
            options: [
              { option: 1, name: "Leche entera" },
              { option: 2, name: "Leche descremada" },
              { option: 3, name: "Leche chocolatada" },
            ],
          },
          {
            question: 2,
            phrase: "leche liviana",
            asks: "productType",
            term: null,
            options: [
              { option: 1, name: "Leche descremada" },
              { option: 2, name: "Leche entera" },
            ],
          },
        ],
      },
    ]);
  });

  it("resolves the answered Item, keeps resolved Items untouched and asks the rest again", async () => {
    const { items, message } = await answer(reply({ question: 1, options: [2] }));
    assert.deepEqual(items.slice(0, 2), [
      resolved("yerba", "yerba"),
      resolved("leche", "leche-descremada"),
    ]);
    assert.equal(items[2]?.question?.kind, "productType");
    assert.match(message ?? "", /^Tengo una pregunta:\n\n1\. Para "leche liviana"/);
  });

  it("leaves the choice among the offered options to the Selection Policy on cualquiera", async () => {
    const { items, message } = await answer(
      reply({ question: 1, options: [1, 2] }, { question: 2, kind: "any" }),
    );
    assert.deepEqual(
      items.map(({ productTypes }) => productTypes.map(({ id }) => id)),
      [["yerba"], ["leche-entera", "leche-descremada"], ["leche-descremada", "leche-entera"]],
    );
    assert.equal(message, null);
  });

  it("keeps the question for an answer that maps to nothing or to options never offered", async () => {
    const { items } = await answer(
      reply(
        { question: 1, kind: "unclear" },
        { question: 2, options: [7] },
        { question: 9, kind: "any" },
      ),
    );
    assert.deepEqual(
      items.map(({ question }) => question?.kind ?? null),
      [null, "productType", "productType"],
    );
  });

  it("checks terms once the Owner picks the Product Type", async () => {
    const { resolution } = await runAndAnswer(
      {
        items: [item("leche", { terms: ["sachet"] })],
        answers: { leche },
        replies: { descremada: reply({ options: [2] }), entera: reply({ options: [1] }) },
      },
      "descremada",
    );
    assert.deepEqual(resolution.items[0]?.question, { kind: "term", term: "sachet" });
    assert.deepEqual(resolution.items[0]?.productTypes, [type("leche-descremada")]);
  });

  it("drops a term the Owner lets go and replaces one the Owner rewords", async () => {
    const yerbaSinTacc = item("yerba", { terms: ["sin TACC"] });
    const dropped = await runAndAnswer(
      { items: [yerbaSinTacc], answers: { yerba }, replies: { sacalo: reply({ kind: "any" }) } },
      "sacalo",
    );
    assert.deepEqual(dropped.resolution.items, [resolved("yerba", "yerba")]);
    const reworded = await runAndAnswer(
      {
        items: [yerbaSinTacc],
        answers: { yerba },
        replies: { "de medio kilo": reply({ kind: "rephrased", phrase: "500 g" }) },
      },
      "de medio kilo",
    );
    assert.deepEqual(reworded.resolution.items, [resolved("yerba", "yerba", { terms: ["500 g"] })]);
  });

  it("turns the chosen size into a term and leaves the size open on cualquiera", async () => {
    const coca = item("coca", { brand: "Coca-Cola", vagueWords: ["grande"] });
    const chosen = await runAndAnswer(
      {
        items: [coca],
        answers: { coca: gaseosa },
        replies: { "la de 2,25": reply({ options: [3] }) },
      },
      "la de 2,25",
    );
    assert.deepEqual(chosen.resolution.items, [
      resolved("coca", "gaseosa", { brand: "Coca-Cola", terms: ["2,25 l"] }),
    ]);
    const any = await runAndAnswer(
      {
        items: [coca],
        answers: { coca: gaseosa },
        replies: { cualquiera: reply({ kind: "any" }) },
      },
      "cualquiera",
    );
    assert.deepEqual(any.resolution.items, [resolved("coca", "gaseosa", { brand: "Coca-Cola" })]);
    const two = await runAndAnswer(
      {
        items: [coca],
        answers: { coca: gaseosa },
        replies: { "1 o 2": reply({ options: [1, 2] }) },
      },
      "1 o 2",
    );
    assert.equal(two.resolution.items[0]?.question?.kind, "size");
  });

  it("resolves the Owner's answer to what they mean as a new phrase, keeping the Item's details", async () => {
    const { resolution, seen } = await runAndAnswer(
      {
        items: [item("lo del mate", { quantity: 2 })],
        answers: { "lo del mate": nothing, "cosa del mate": nothing, "yerba mate": yerba },
        rewordings: { "lo del mate": "cosa del mate" },
        replies: { "la yerba": reply({ kind: "rephrased", phrase: "yerba mate" }) },
      },
      "la yerba",
    );
    assert.deepEqual(seen.asked[0]?.questions, [
      { question: 1, phrase: "lo del mate", asks: "phrase", term: null, options: [] },
    ]);
    assert.deepEqual(resolution, {
      items: [resolved("yerba mate", "yerba", { quantity: 2 })],
      paymentCard: null,
      preference: null,
      message: null,
    });
  });

  it("asks again what the Owner means when the new phrase still matches nothing", async () => {
    const { resolution, seen } = await runAndAnswer(
      {
        items: [item("lo del mate")],
        answers: { "lo del mate": nothing, bombilla: nothing },
        rewordings: { "lo del mate": "lo del mate", bombilla: "bombilla" },
        replies: {
          "una bombilla": reply({ kind: "rephrased", phrase: "bombilla" }),
          "la segunda": reply({ options: [2] }),
        },
      },
      "una bombilla",
      "la segunda",
    );
    assert.equal(
      resolution.message,
      'Tengo una pregunta:\n\n1. No encontré "bombilla". ¿A qué te referís?',
    );
    assert.equal(seen.reworded.length, 2);
  });

  it("never asks for a postal code, even when the order has none", async () => {
    const { resolution } = await run({ items: [item("yerba")], answers: { yerba } });
    assert.deepEqual(resolution, {
      items: [resolved("yerba", "yerba")],
      paymentCard: null,
      preference: null,
      message: null,
    });
  });

  it("asks only about the Items when the order also has questions", async () => {
    const { resolution, seen } = await runAndAnswer(
      {
        items: [item("yerba"), item("leche")],
        answers: { yerba, leche },
        replies: { "no sé": reply({ kind: "unclear" }) },
      },
      "no sé",
    );
    assert.deepEqual(
      seen.asked[0]?.questions.map(({ asks }) => asks),
      ["productType"],
    );
    assert.ok(!resolution.message?.includes("código postal"));
  });

  it("keeps the order's Payment Card and preference through the questions round", async () => {
    const { resolution } = await runAndAnswer(
      {
        items: [item("leche")],
        answers: { leche },
        paymentCard: "Tarjeta Carrefour Mastercard",
        preference: "solo La Serenísima",
        replies: { entera: reply({ options: [1] }) },
      },
      "entera",
    );
    assert.equal(resolution.message, null);
    assert.equal(resolution.paymentCard, "Tarjeta Carrefour Mastercard");
    assert.equal(resolution.preference, "solo La Serenísima");
  });
});
