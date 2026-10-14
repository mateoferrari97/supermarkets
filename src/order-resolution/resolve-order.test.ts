import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
  ],
};

const mapping = {
  "Leche entera": "leche-entera",
  "Leche descremada": "leche-descremada",
  "Leche chocolatada": "leche-chocolatada",
  Yerba: "yerba",
  "Leche balsámica": null,
};

const products: CatalogProduct[] = [
  { name: "Leche entera La Serenísima 1 l", brand: "La Serenísima", tipo: "Leche entera" },
  { name: "Leche descremada Sancor 1 l", brand: "Sancor", tipo: "Leche descremada" },
  { name: "Leche chocolatada Cindor 1 l", brand: "Cindor", tipo: "Leche chocolatada" },
  { name: "Yerba mate Playadito 1 kg", brand: "Playadito", tipo: "Yerba" },
  { name: "Leche balsámica corporal 200 ml", brand: "Nivea", tipo: "Leche balsámica" },
  { name: "Huevos blancos x 12", brand: null, tipo: null },
];

const item = (phrase: string, overrides: Partial<Item> = {}): Item => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  ...overrides,
});

type Script = {
  items: Item[];
  answers: Record<string, ResolveItemOutput>;
  rewordings?: Record<string, string>;
  replies?: Record<string, MapAnswerOutput>;
};

type Seen = { resolved: ResolveItemInput[]; reworded: ResolveItemInput[]; asked: MapAnswerInput[] };

const scripted = <T>(table: Record<string, T>, key: string, task: string): Promise<T> => {
  const value = table[key];
  if (value === undefined) return Promise.reject(new Error(`no scripted ${task} for ${key}`));
  return Promise.resolve(value);
};

const fakeLlm = ({ items, answers, rewordings = {}, replies = {} }: Script) => {
  const seen: Seen = { resolved: [], reworded: [], asked: [] };
  const llm: Llm = {
    splitOrder: () => Promise.resolve({ items }),
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
    const { resolution } = await run({
      items: [
        item("yerba"),
        item("leche entera", { quantity: 2, brand: "La Serenísima", terms: ["1 l"] }),
      ],
      answers: {
        yerba: { kind: "match", candidates: ["yerba"] },
        "leche entera": { kind: "match", candidates: ["leche-entera"] },
      },
    });
    assert.deepEqual(resolution.items, [
      { ...item("yerba"), status: "resolved", productTypes: [{ id: "yerba", name: "Yerba" }] },
      {
        ...item("leche entera", { quantity: 2, brand: "La Serenísima", terms: ["1 l"] }),
        status: "resolved",
        productTypes: [{ id: "leche-entera", name: "Leche entera" }],
      },
    ]);
  });

  it("keeps only the Items the split returns, so exclusions never become Items", async () => {
    const { resolution } = await run({
      items: [item("yerba")],
      answers: { yerba: { kind: "match", candidates: ["yerba"] } },
    });
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
    const [yerba, dulce] = resolution.items;
    assert.equal(yerba?.status, "resolved");
    assert.deepEqual(dulce, {
      ...item("dulce de leche"),
      status: "pending",
      reason: "none",
      candidates: [],
    });
  });

  it("leaves a Group or an ambiguous answer pending with its Product Types as candidates", async () => {
    const { resolution } = await run({
      items: [item("leche"), item("leche liviana")],
      answers: {
        leche: { kind: "match", candidates: ["grupo-leche"] },
        "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
      },
    });
    const [leche, liviana] = resolution.items;
    assert.equal(leche?.status === "pending" && leche.reason, "group");
    assert.deepEqual(leche?.status === "pending" && leche.candidates.map(({ id }) => id), [
      "leche-entera",
      "leche-descremada",
      "leche-chocolatada",
    ]);
    assert.equal(liviana?.status === "pending" && liviana.reason, "ambiguous");
  });

  it("rewords an Item with no match exactly once and resolves the rewording", async () => {
    const { resolution, seen } = await run({
      items: [item("yerva", { quantity: 2 })],
      answers: {
        yerva: { kind: "none", candidates: [] },
        yerba: { kind: "match", candidates: ["yerba"] },
      },
      rewordings: { yerva: "yerba" },
    });
    assert.deepEqual(resolution.items, [
      {
        ...item("yerva", { quantity: 2 }),
        status: "resolved",
        productTypes: [{ id: "yerba", name: "Yerba" }],
      },
    ]);
    assert.deepEqual(
      seen.resolved.map(({ item: { phrase } }) => phrase),
      ["yerva", "yerba"],
    );
    assert.equal(seen.reworded.length, 1);
    assert.equal(seen.resolved[1]!.evidence[0]?.productTypeId, "yerba");
  });

  it("asks every pending Item in one message, with numbered options or what the Owner means", async () => {
    const { resolution } = await run({
      items: [item("yerba"), item("leche"), item("leche liviana"), item("pan")],
      answers: {
        yerba: { kind: "match", candidates: ["yerba"] },
        leche: { kind: "match", candidates: ["grupo-leche"] },
        "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
        pan: { kind: "none", candidates: [] },
        "pan de molde": { kind: "none", candidates: [] },
      },
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

  it("has no message when nothing is asked", async () => {
    const { resolution } = await run({
      items: [item("yerba")],
      answers: { yerba: { kind: "match", candidates: ["yerba"] } },
    });
    assert.equal(resolution.message, null);
  });
});

describe("answerQuestions", () => {
  const script = (replies: Record<string, MapAnswerOutput>): Script => ({
    items: [item("yerba"), item("leche"), item("leche liviana")],
    answers: {
      yerba: { kind: "match", candidates: ["yerba"] },
      leche: { kind: "match", candidates: ["grupo-leche"] },
      "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
    },
    replies,
  });

  const answer = (answerReply: MapAnswerOutput) =>
    runAndAnswer(script({ respuesta: answerReply }), "respuesta").then(
      ({ resolution }) => resolution,
    );

  it("offers the LLM only the questions and their numbered options", async () => {
    const { seen } = await runAndAnswer(script({ respuesta: reply() }), "respuesta");
    assert.deepEqual(seen.asked, [
      {
        answer: "respuesta",
        questions: [
          {
            question: 1,
            phrase: "leche",
            options: [
              { option: 1, name: "Leche entera" },
              { option: 2, name: "Leche descremada" },
              { option: 3, name: "Leche chocolatada" },
            ],
          },
          {
            question: 2,
            phrase: "leche liviana",
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
    assert.deepEqual(items[0], {
      ...item("yerba"),
      status: "resolved",
      productTypes: [{ id: "yerba", name: "Yerba" }],
    });
    assert.deepEqual(items[1], {
      ...item("leche"),
      status: "resolved",
      productTypes: [{ id: "leche-descremada", name: "Leche descremada" }],
    });
    assert.equal(items[2]?.status, "pending");
    assert.match(message ?? "", /^Tengo una pregunta:\n\n1\. Para "leche liviana"/);
  });

  it("leaves the choice among the offered options to the Selection Policy on cualquiera", async () => {
    const { items, message } = await answer(
      reply({ question: 1, options: [1, 2] }, { question: 2, kind: "any" }),
    );
    assert.deepEqual(
      items.map(
        (resolved) => resolved.status === "resolved" && resolved.productTypes.map(({ id }) => id),
      ),
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
      items.map(({ status }) => status),
      ["resolved", "pending", "pending"],
    );
  });

  it("resolves the Owner's answer to what they mean as a new phrase, keeping the Item's details", async () => {
    const { resolution, seen } = await runAndAnswer(
      {
        items: [item("lo del mate", { quantity: 2 })],
        answers: {
          "lo del mate": { kind: "none", candidates: [] },
          "cosa del mate": { kind: "none", candidates: [] },
          "yerba mate": { kind: "match", candidates: ["yerba"] },
        },
        rewordings: { "lo del mate": "cosa del mate" },
        replies: {
          "la yerba": reply({ kind: "rephrased", phrase: "yerba mate" }),
        },
      },
      "la yerba",
    );
    assert.deepEqual(seen.asked[0]?.questions, [
      { question: 1, phrase: "lo del mate", options: [] },
    ]);
    assert.deepEqual(resolution, {
      items: [
        {
          ...item("yerba mate", { quantity: 2 }),
          status: "resolved",
          productTypes: [{ id: "yerba", name: "Yerba" }],
        },
      ],
      message: null,
    });
  });

  it("asks again what the Owner means when the new phrase still matches nothing", async () => {
    const { resolution, seen } = await runAndAnswer(
      {
        items: [item("lo del mate")],
        answers: {
          "lo del mate": { kind: "none", candidates: [] },
          bombilla: { kind: "none", candidates: [] },
        },
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
    assert.equal(resolution.items[0]?.status, "pending");
  });
});
