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
import { answerQuestions, resolveOrder, type CatalogProduct } from "./resolve-order.ts";

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

const fakeLlm = (
  items: Item[],
  answers: Record<string, ResolveItemOutput>,
  seen: ResolveItemInput[] = [],
  replies: Record<string, MapAnswerOutput> = {},
  asked: MapAnswerInput[] = [],
): Llm => ({
  splitOrder: () => Promise.resolve({ items }),
  mapAnswer: (input) => {
    asked.push(input);
    const reply = replies[input.answer];
    if (!reply) return Promise.reject(new Error(`no scripted reply for ${input.answer}`));
    return Promise.resolve(reply);
  },
  resolveItem: (input) => {
    seen.push(input);
    const answer = answers[input.item.phrase];
    if (!answer) return Promise.reject(new Error(`no scripted answer for ${input.item.phrase}`));
    return Promise.resolve(answer);
  },
});

const run = (llm: Llm) => resolveOrder("pedido", { products, vocabulary, mapping, llm });

describe("resolveOrder", () => {
  it("resolves clear Items with their quantity, brand and terms", async () => {
    const llm = fakeLlm(
      [
        item("yerba"),
        item("leche entera", { quantity: 2, brand: "La Serenísima", terms: ["1 l"] }),
      ],
      {
        yerba: { kind: "match", candidates: ["yerba"] },
        "leche entera": { kind: "match", candidates: ["leche-entera"] },
      },
    );
    assert.deepEqual((await run(llm)).items, [
      { ...item("yerba"), status: "resolved", productTypes: [{ id: "yerba", name: "Yerba" }] },
      {
        ...item("leche entera", { quantity: 2, brand: "La Serenísima", terms: ["1 l"] }),
        status: "resolved",
        productTypes: [{ id: "leche-entera", name: "Leche entera" }],
      },
    ]);
  });

  it("keeps only the Items the split returns, so exclusions never become Items", async () => {
    const llm = fakeLlm([item("yerba")], { yerba: { kind: "match", candidates: ["yerba"] } });
    assert.deepEqual(
      (await run(llm)).items.map(({ phrase }) => phrase),
      ["yerba"],
    );
  });

  it("gives the LLM evidence from mapped products only, brand matches first", async () => {
    const seen: ResolveItemInput[] = [];
    const llm = fakeLlm(
      [item("leche", { brand: "Cindor" })],
      { leche: { kind: "match", candidates: ["leche-chocolatada"] } },
      seen,
    );
    await run(llm);
    const evidence = seen[0]!.evidence;
    assert.deepEqual(evidence[0], {
      product: "Leche chocolatada Cindor 1 l",
      productTypeId: "leche-chocolatada",
      productTypeName: "Leche chocolatada",
    });
    assert.ok(evidence.every(({ product }) => !product.includes("balsámica")));
  });

  it("drops invented ids and treats an answer left without known ids as no match", async () => {
    const llm = fakeLlm([item("yerba"), item("dulce de leche")], {
      yerba: { kind: "match", candidates: ["yerba-mate-inventada", "yerba"] },
      "dulce de leche": { kind: "match", candidates: ["dulce-de-leche"] },
    });
    const [yerba, dulce] = (await run(llm)).items;
    assert.equal(yerba?.status, "resolved");
    assert.deepEqual(dulce, {
      ...item("dulce de leche"),
      status: "pending",
      reason: "none",
      candidates: [],
    });
  });

  it("leaves a Group or an ambiguous answer pending with its Product Types as candidates", async () => {
    const llm = fakeLlm([item("leche"), item("leche liviana")], {
      leche: { kind: "match", candidates: ["grupo-leche"] },
      "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
    });
    const [leche, liviana] = (await run(llm)).items;
    assert.equal(leche?.status === "pending" && leche.reason, "group");
    assert.deepEqual(leche?.status === "pending" && leche.candidates.map(({ id }) => id), [
      "leche-entera",
      "leche-descremada",
      "leche-chocolatada",
    ]);
    assert.equal(liviana?.status === "pending" && liviana.reason, "ambiguous");
  });

  it("asks every Group and ambiguous Item in one message with numbered options", async () => {
    const llm = fakeLlm([item("yerba"), item("leche"), item("leche liviana"), item("pan")], {
      yerba: { kind: "match", candidates: ["yerba"] },
      leche: { kind: "match", candidates: ["grupo-leche"] },
      "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
      pan: { kind: "none", candidates: [] },
    });
    assert.equal(
      (await run(llm)).message,
      [
        "Tengo unas preguntas:",
        '1. Para "leche", ¿cuál querés?\n   1) Leche entera\n   2) Leche descremada\n   3) Leche chocolatada',
        '2. Para "leche liviana", ¿cuál querés?\n   1) Leche descremada\n   2) Leche entera',
        'Respondé con el número o con palabras ("la 2", "entera"), o "cualquiera" si te da igual.',
      ].join("\n\n"),
    );
  });

  it("has no message when nothing is asked", async () => {
    const llm = fakeLlm([item("yerba")], { yerba: { kind: "match", candidates: ["yerba"] } });
    assert.equal((await run(llm)).message, null);
  });
});

describe("answerQuestions", () => {
  const split = [item("yerba"), item("leche"), item("leche liviana")];
  const resolutions: Record<string, ResolveItemOutput> = {
    yerba: { kind: "match", candidates: ["yerba"] },
    leche: { kind: "match", candidates: ["grupo-leche"] },
    "leche liviana": { kind: "ambiguous", candidates: ["leche-descremada", "leche-entera"] },
  };

  const answer = async (reply: MapAnswerOutput, asked: MapAnswerInput[] = []) => {
    const llm = fakeLlm(split, resolutions, [], { respuesta: reply }, asked);
    return answerQuestions(await run(llm), "respuesta", { llm });
  };

  it("offers the LLM only the questions and their numbered options", async () => {
    const asked: MapAnswerInput[] = [];
    await answer({ answers: [] }, asked);
    assert.deepEqual(asked, [
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
    const { items, message } = await answer({
      answers: [{ question: 1, kind: "chosen", options: [2] }],
    });
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
    const { items, message } = await answer({
      answers: [
        { question: 1, kind: "chosen", options: [1, 2] },
        { question: 2, kind: "any", options: [] },
      ],
    });
    assert.deepEqual(
      items.map(
        (resolved) => resolved.status === "resolved" && resolved.productTypes.map(({ id }) => id),
      ),
      [["yerba"], ["leche-entera", "leche-descremada"], ["leche-descremada", "leche-entera"]],
    );
    assert.equal(message, null);
  });

  it("keeps the question for an answer that maps to nothing or to options never offered", async () => {
    const { items } = await answer({
      answers: [
        { question: 1, kind: "unclear", options: [] },
        { question: 2, kind: "chosen", options: [7] },
        { question: 9, kind: "any", options: [] },
      ],
    });
    assert.deepEqual(
      items.map(({ status }) => status),
      ["resolved", "pending", "pending"],
    );
  });
});
