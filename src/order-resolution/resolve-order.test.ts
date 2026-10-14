import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item, Llm, ResolveItemInput, ResolveItemOutput } from "./llm.ts";
import { resolveOrder, type CatalogProduct } from "./resolve-order.ts";

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
): Llm => ({
  splitOrder: () => Promise.resolve({ items }),
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
      { ...item("yerba"), status: "resolved", productType: { id: "yerba", name: "Yerba" } },
      {
        ...item("leche entera", { quantity: 2, brand: "La Serenísima", terms: ["1 l"] }),
        status: "resolved",
        productType: { id: "leche-entera", name: "Leche entera" },
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
});
