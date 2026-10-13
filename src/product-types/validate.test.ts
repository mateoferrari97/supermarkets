import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateProductTypes } from "./validate.ts";

const vocabulary = {
  groups: [
    {
      id: "leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera" },
        { id: "leche-descremada", name: "Leche descremada" },
      ],
    },
  ],
};

const mapping = {
  "Leche entera": "leche-entera",
  Leches: "leche-entera",
  "Leche descremada": "leche-descremada",
  "Leche balsámica": null,
};

describe("validateProductTypes", () => {
  it("accepts a consistent vocabulary and mapping", () => {
    assert.deepEqual(validateProductTypes(vocabulary, mapping), []);
  });

  it("accepts an empty vocabulary and mapping", () => {
    assert.deepEqual(validateProductTypes({ groups: [] }, {}), []);
  });

  it("rejects a mapping to an unknown Product Type", () => {
    assert.deepEqual(validateProductTypes(vocabulary, { "Leche en polvo": "leche-en-polvo" }), [
      'Tipo "Leche en polvo" maps to unknown Product Type "leche-en-polvo"',
    ]);
  });

  it("rejects a mapping to a Product Type Group", () => {
    assert.deepEqual(validateProductTypes(vocabulary, { Leches: "leche" }), [
      'Tipo "Leches" maps to Product Type Group "leche" instead of a Product Type',
    ]);
  });

  it("rejects a Product Type that appears in two Groups", () => {
    const twice = {
      groups: [
        ...vocabulary.groups,
        {
          id: "lacteos",
          name: "Lácteos",
          productTypes: [{ id: "leche-entera", name: "Leche entera" }],
        },
      ],
    };
    assert.deepEqual(validateProductTypes(twice, {}), [
      'Product Type id "leche-entera" is used more than once',
    ]);
  });

  it("rejects a Group and a Product Type sharing an id", () => {
    const shared = {
      groups: [{ id: "yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] }],
    };
    assert.deepEqual(validateProductTypes(shared, {}), [
      'Product Type id "yerba" is used more than once',
    ]);
  });

  it("rejects ids that are not lowercase hyphenated slugs", () => {
    const malformed = {
      groups: [
        {
          id: "Leche",
          name: "Leche",
          productTypes: [{ id: "leche_entera", name: "Leche entera" }],
        },
      ],
    };
    assert.deepEqual(validateProductTypes(malformed, {}), [
      'Product Type Group id "Leche" is not a lowercase hyphenated slug',
      'Product Type id "leche_entera" is not a lowercase hyphenated slug',
    ]);
  });

  it("rejects an empty Group", () => {
    const empty = { groups: [{ id: "leche", name: "Leche", productTypes: [] }] };
    assert.deepEqual(validateProductTypes(empty, {}), [
      'Product Type Group "leche" has no Product Types',
    ]);
  });

  it("rejects files with the wrong shape", () => {
    const errors = validateProductTypes({ groups: [{ id: "leche" }] }, { Leches: 3 });
    assert.ok(errors.some((error) => error.startsWith('vocabulary at "groups.0.name"')));
    assert.ok(errors.some((error) => error.startsWith('mapping at "Leches"')));
  });
});
