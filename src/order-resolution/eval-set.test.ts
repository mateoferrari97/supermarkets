import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Item } from "./llm.ts";
import { scoreCase, validateEvalSet, type EvalCase } from "./eval-set.ts";
import type { OrderItem, OrderResolution } from "./resolve-order.ts";

const vocabulary = {
  groups: [
    {
      id: "grupo-leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera" },
        { id: "leche-descremada", name: "Leche descremada" },
      ],
    },
    { id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] },
  ],
};

const item = (phrase: string, overrides: Partial<Item> = {}): Item => ({
  phrase,
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  ...overrides,
});

const resolved = (phrase: string, id: string, overrides: Partial<Item> = {}): OrderItem => ({
  ...item(phrase, overrides),
  productTypes: [{ id, name: id }],
  question: null,
});

const pending = (phrase: string, ids: string[], overrides: Partial<Item> = {}): OrderItem => ({
  ...item(phrase, overrides),
  productTypes: [],
  question: { kind: "productType", reason: "group", options: ids.map((id) => ({ id, name: id })) },
});

const score = (
  evalCase: Omit<EvalCase, "id" | "order">,
  resolution: Pick<OrderResolution, "items">,
) =>
  scoreCase(
    { id: "case", order: "pedido", ...evalCase },
    { ...resolution, postalCode: "1425", message: null },
    vocabulary,
  );

describe("validateEvalSet", () => {
  it("accepts cases whose expected ids are in the vocabulary", () => {
    const evalSet = {
      cases: [
        {
          id: "leche",
          order: "leche y nada de yerba",
          items: [{ question: { group: "grupo-leche" } }, { noItem: "yerba" }],
        },
        { id: "yerba", order: "dos yerbas", items: [{ productType: "yerba", quantity: 2 }] },
      ],
    };
    assert.deepEqual(validateEvalSet(evalSet, vocabulary), []);
  });

  it("reports unknown ids, a Group used as a Product Type, repeated ids and a bad shape", () => {
    const evalSet = {
      cases: [
        { id: "a", order: "x", items: [{ productType: "grupo-leche" }] },
        {
          id: "a",
          order: "x",
          items: [{ question: { group: "leche-entera", includes: ["mate"] } }],
        },
        { id: "b", order: "x", items: [{ noItem: "huevo" }] },
      ],
    };
    assert.deepEqual(validateEvalSet(evalSet, vocabulary), [
      'eval case "a" expects unknown Product Type "grupo-leche"',
      'eval case "a" id is used more than once',
      'eval case "a" expects unknown Product Type Group "leche-entera"',
      'eval case "a" expects unknown Product Type "mate"',
      'eval case "b" expects no Item at all',
    ]);
    assert.ok(
      validateEvalSet({ cases: [{ id: "c", order: "x", items: [{ question: {} }] }] }, vocabulary)
        .length > 0,
    );
  });
});

describe("scoreCase", () => {
  it("hits when every expected Item is matched one to one and excluded words have no Item", () => {
    const result = score(
      {
        items: [
          { productType: "leche-entera", quantity: 2, terms: ["sin TACC"] },
          { question: { group: "grupo-leche" }, brand: "La Serenisima" },
          { noItem: "huevo" },
        ],
      },
      {
        items: [
          pending("leche", ["leche-entera", "leche-descremada"], { brand: "La Serenísima" }),
          resolved("leche entera", "leche-entera", { quantity: 2, terms: ["sin tacc", "1 l"] }),
        ],
      },
    );
    assert.deepEqual(result, { hit: true, problems: [] });
  });

  it("misses with the reasons: an excluded word that became an Item, a count and no match", () => {
    const result = score(
      { items: [{ productType: "yerba" }, { noItem: "huevo" }] },
      { items: [resolved("huevos", "yerba"), resolved("yerba", "leche-entera")] },
    );
    assert.deepEqual(result, {
      hit: false,
      problems: ['expected no Item for "huevo", got "huevos"', "expected 1 Items, got 2"],
    });
  });

  it("misses a question when an expected option is not offered or the Item was resolved", () => {
    const result = score(
      { items: [{ question: { includes: ["leche-descremada"] } }] },
      {
        items: [pending("leche", ["leche-entera"])],
      },
    );
    assert.deepEqual(result.problems, ["no Item matches a question over leche-descremada"]);
    assert.equal(
      score(
        { items: [{ question: { group: "grupo-leche" } }] },
        {
          items: [resolved("leche", "leche-entera")],
        },
      ).hit,
      false,
    );
  });

  it("misses when quantity or brand differ", () => {
    const resolution = { items: [resolved("yerba", "yerba", { quantity: 1, brand: "Playadito" })] };
    assert.equal(score({ items: [{ productType: "yerba", quantity: 2 }] }, resolution).hit, false);
    assert.equal(
      score({ items: [{ productType: "yerba", brand: "Taragüí" }] }, resolution).hit,
      false,
    );
    assert.equal(
      score({ items: [{ productType: "yerba", brand: "playadito" }] }, resolution).hit,
      true,
    );
  });

  it("hits a Product Type whose Item still asks about a size or a term", () => {
    const sized = {
      ...resolved("coca", "gaseosa"),
      question: { kind: "size" as const, options: ["2,25 l"] },
    };
    assert.equal(score({ items: [{ productType: "gaseosa" }] }, { items: [sized] }).hit, true);
  });
});
