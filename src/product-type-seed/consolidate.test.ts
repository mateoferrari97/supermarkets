import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { validateProductTypes } from "../product-types/validate.ts";
import { consolidate, renderSummary, type Consolidation, type Decision } from "./consolidate.ts";
import type { Proposal } from "./proposal.ts";
import type { Part, PartTipo } from "./split.ts";

const tipo = (name: string, products = 1): PartTipo => ({
  tipo: name,
  products,
  availableProducts: products,
  familias: [],
  measureUnits: [],
  examples: [`${name} ejemplo`],
});

const parts: Part[] = [
  {
    id: "lacteos",
    department: "Lácteos y productos frescos",
    tipos: [
      tipo("Leche entera", 10),
      tipo("Leches", 4),
      tipo("Leche en polvo entera", 3),
      tipo("Leche balsámica", 2),
    ],
  },
  {
    id: "desayuno",
    department: "Desayuno y merienda",
    tipos: [tipo("Leche en polvo", 5), tipo("Leche larga vida entera", 6), tipo("Cacao", 7)],
  },
];

const lacteos: Proposal = {
  part: "lacteos",
  groups: [
    {
      id: "grupo-leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera", tipos: ["Leche entera", "Leches"] },
        { id: "leche-polvo", name: "Leche polvo", tipos: [] },
      ],
    },
  ],
  excluded: [{ tipo: "Leche balsámica", reason: "Crema corporal" }],
  doubts: [
    {
      tipo: "Leche en polvo entera",
      candidates: ["leche-polvo", "leche-entera"],
      reason: "Mezcla polvo y fluida",
    },
  ],
};

const desayuno: Proposal = {
  part: "desayuno",
  groups: [
    {
      id: "grupo-leches",
      name: "Leches",
      productTypes: [
        { id: "leche-en-polvo", name: "Leche en polvo", tipos: ["Leche en polvo"] },
        { id: "leche-entera", name: "Leche entera", tipos: ["Leche larga vida entera"] },
      ],
    },
    {
      id: "grupo-cacao",
      name: "Cacao",
      productTypes: [{ id: "cacao", name: "Cacao", tipos: ["Cacao"] }],
    },
  ],
  excluded: [],
  doubts: [],
};

const run = (decisions: Decision[], proposals = [lacteos, desayuno]) =>
  consolidate(parts, proposals, decisions);

const consolidated = (decisions: Decision[], proposals?: Proposal[]): Consolidation => {
  const result = run(decisions, proposals);
  if (!result.ok) assert.fail(result.errors.join("\n"));
  return result.consolidation;
};

const warningsOf = (decisions: Decision[], proposals?: Proposal[]): string[] => {
  const result = run(decisions, proposals);
  if (!result.ok) assert.fail(result.errors.join("\n"));
  return result.warnings;
};

const errorsOf = (decisions: Decision[], proposals?: Proposal[]): string[] => {
  const result = run(decisions, proposals);
  if (result.ok) assert.fail("expected consolidation to fail");
  return result.errors;
};

const merges: Decision[] = [
  { op: "merge", from: "grupo-leches", into: "grupo-leche" },
  { op: "merge", from: "leche-polvo", into: "leche-en-polvo" },
];

describe("consolidate", () => {
  it("merges Groups and Product Types across parts and writes a valid vocabulary and mapping", () => {
    const { vocabulary, mapping, doubts } = consolidated(merges);
    assert.deepEqual(vocabulary, {
      groups: [
        { id: "grupo-cacao", name: "Cacao", productTypes: [{ id: "cacao", name: "Cacao" }] },
        {
          id: "grupo-leche",
          name: "Leche",
          productTypes: [
            { id: "leche-en-polvo", name: "Leche en polvo" },
            { id: "leche-entera", name: "Leche entera" },
          ],
        },
      ],
    });
    assert.deepEqual(mapping, {
      Cacao: "cacao",
      "Leche balsámica": null,
      "Leche en polvo": "leche-en-polvo",
      "Leche entera": "leche-entera",
      "Leche larga vida entera": "leche-entera",
      Leches: "leche-entera",
    });
    assert.deepEqual(validateProductTypes(vocabulary, mapping), []);
    assert.deepEqual(doubts, [
      {
        tipo: "Leche en polvo entera",
        part: "lacteos",
        products: 3,
        examples: ["Leche en polvo entera ejemplo"],
        candidates: [
          { id: "leche-en-polvo", name: "Leche en polvo", group: "Leche" },
          { id: "leche-entera", name: "Leche entera", group: "Leche" },
        ],
        reason: "Mezcla polvo y fluida",
      },
    ]);
  });

  it("reports a Product Type left in two Groups", () => {
    const result = run([]);
    assert.equal(result.ok, false);
    assert.deepEqual(!result.ok && result.errors, [
      'Product Type "leche-entera" is in Groups "grupo-leche", "grupo-leches"; merge the Groups or move the Product Type',
    ]);
  });

  it("accepts a move instead of a Group merge", () => {
    const { vocabulary } = consolidated([
      { op: "move", productType: "leche-entera", group: "grupo-leche" },
      { op: "move", productType: "leche-en-polvo", group: "grupo-leche" },
    ]);
    assert.deepEqual(
      vocabulary.groups.map((group) => group.id),
      ["grupo-cacao", "grupo-leche"],
    );
  });

  it("places and excludes doubts and keeps a placed Tipo out of the remaining doubts", () => {
    const { mapping, doubts, excluded } = consolidated([
      ...merges,
      { op: "place", tipo: "Leche en polvo entera", productType: "leche-polvo" },
      { op: "exclude", tipo: "Cacao", reason: "Prueba" },
    ]);
    assert.equal(mapping["Leche en polvo entera"], "leche-en-polvo");
    assert.equal(mapping.Cacao, null);
    assert.deepEqual(doubts, []);
    assert.deepEqual(
      excluded.map(({ tipo }) => tipo),
      ["Cacao", "Leche balsámica"],
    );
  });

  it("adds a Group and a Product Type and renames", () => {
    const { vocabulary, mapping } = consolidated([
      ...merges,
      { op: "addGroup", id: "grupo-leche-en-polvo", name: "Leche en polvo" },
      {
        op: "addProductType",
        id: "leche-en-polvo-entera",
        name: "Leche en polvo entera",
        group: "grupo-leche-en-polvo",
      },
      { op: "place", tipo: "Leche en polvo entera", productType: "leche-en-polvo-entera" },
      { op: "rename", id: "grupo-cacao", name: "Cacao en polvo" },
    ]);
    assert.equal(mapping["Leche en polvo entera"], "leche-en-polvo-entera");
    assert.deepEqual(
      vocabulary.groups.map((group) => group.name),
      ["Cacao en polvo", "Leche", "Leche en polvo"],
    );
    assert.deepEqual(validateProductTypes(vocabulary, mapping), []);
  });

  it("leaves Product Types without Tipos and their empty Groups out of the vocabulary", () => {
    const { vocabulary } = consolidated([], [lacteos]);
    assert.deepEqual(vocabulary.groups[0]?.productTypes, [
      { id: "leche-entera", name: "Leche entera" },
    ]);
  });

  it("reports decisions that name unknown ids or Tipos", () => {
    const result = run([
      ...merges,
      { op: "merge", from: "cacao", into: "grupo-leche" },
      { op: "place", tipo: "Yerba", productType: "cacao" },
      { op: "place", tipo: "Cacao", productType: "yerba" },
      { op: "addGroup", id: "grupo-leche", name: "Leche" },
      { op: "addGroup", id: "Grupo Yerba", name: "Yerba" },
    ]);
    assert.deepEqual(!result.ok && result.errors, [
      'decision 3 (merge): "cacao" and "grupo-leche" are not two Groups or two Product Types',
      'decision 4 (place): unknown Tipo "Yerba"',
      'decision 5 (place): unknown Product Type "yerba"',
      'decision 6 (addGroup): id "grupo-leche" already exists',
      'decision 7 (addGroup): id "Grupo Yerba" is not a lowercase hyphenated slug',
    ]);
  });

  it("replaces a redone part's proposal and keeps the decisions that still apply", () => {
    const redone: Proposal = {
      ...desayuno,
      groups: [
        {
          id: "grupo-leches",
          name: "Leches",
          productTypes: [
            {
              id: "leche-en-polvo",
              name: "Leche en polvo",
              tipos: ["Leche en polvo", "Leche larga vida entera"],
            },
          ],
        },
        desayuno.groups[1]!,
      ],
    };
    const { mapping } = consolidated(merges, [lacteos, redone]);
    assert.equal(mapping["Leche larga vida entera"], "leche-en-polvo");
    assert.equal(mapping["Leche entera"], "leche-entera");
  });

  it("follows chained merges in later decisions and doubt candidates", () => {
    const { mapping, doubts } = consolidated([
      ...merges,
      {
        op: "addProductType",
        id: "leche-polvo-entera",
        name: "Leche polvo entera",
        group: "grupo-leches",
      },
      { op: "merge", from: "leche-en-polvo", into: "leche-polvo-entera" },
      { op: "place", tipo: "Cacao", productType: "leche-polvo" },
    ]);
    assert.equal(mapping["Leche en polvo"], "leche-polvo-entera");
    assert.equal(mapping.Cacao, "leche-polvo-entera");
    assert.deepEqual(
      doubts[0]?.candidates.map((candidate) =>
        candidate === "excluded" ? candidate : candidate.id,
      ),
      ["leche-polvo-entera", "leche-entera"],
    );
  });

  it("reports an id used as a Group in one part and as a Product Type in another", () => {
    const clash: Proposal = {
      ...desayuno,
      groups: [
        {
          id: "cacao",
          name: "Cacao",
          productTypes: [{ id: "cacao-amargo", name: "Cacao amargo", tipos: ["Cacao"] }],
        },
        desayuno.groups[0]!,
      ],
    };
    const lacteosWithCacao: Proposal = {
      ...lacteos,
      groups: [
        {
          ...lacteos.groups[0]!,
          productTypes: [
            ...lacteos.groups[0]!.productTypes,
            { id: "cacao", name: "Cacao", tipos: [] },
          ],
        },
      ],
      doubts: [{ ...lacteos.doubts[0]!, candidates: ["leche-polvo", "cacao"] }],
    };
    assert.deepEqual(errorsOf(merges, [lacteosWithCacao, clash]), [
      'id "cacao" is a Product Type Group in part "desayuno" and a Product Type in part "lacteos"; change it in one proposal',
    ]);
  });

  it("keeps a Group conflict visible when a moved Product Type is merged into an unmoved one", () => {
    assert.deepEqual(
      errorsOf([
        { op: "move", productType: "leche-en-polvo", group: "grupo-leche" },
        { op: "merge", from: "leche-en-polvo", into: "leche-entera" },
      ]),
      [
        'Product Type "leche-entera" is in Groups "grupo-leche", "grupo-leches"; merge the Groups or move the Product Type',
      ],
    );
  });

  it("refuses to rename an id that was merged away", () => {
    assert.deepEqual(errorsOf([...merges, { op: "rename", id: "leche-polvo", name: "Polvo" }]), [
      'decision 3 (rename): "leche-polvo" was merged into "leche-en-polvo"; rename "leche-en-polvo"',
    ]);
  });

  it("refuses the reserved id excluded and accepts a new Product Type in a merged-away Group", () => {
    assert.deepEqual(
      errorsOf([
        ...merges,
        { op: "addProductType", id: "excluded", name: "Excluido", group: "grupo-leche" },
      ]),
      ['decision 3 (addProductType): id "excluded" already exists'],
    );
    const { vocabulary } = consolidated([
      ...merges,
      { op: "addProductType", id: "leche-de-cabra", name: "Leche de cabra", group: "grupo-leches" },
      { op: "place", tipo: "Leches", productType: "leche-de-cabra" },
    ]);
    assert.ok(
      vocabulary.groups
        .find((group) => group.id === "grupo-leche")
        ?.productTypes.some((productType) => productType.id === "leche-de-cabra"),
    );
  });

  it("warns when a decision overrides a placement a redone part made with confidence", () => {
    const redone: Proposal = {
      ...desayuno,
      groups: [
        desayuno.groups[0]!,
        {
          id: "grupo-cacao",
          name: "Cacao",
          productTypes: [{ id: "cacao-amargo", name: "Cacao amargo", tipos: ["Cacao"] }],
        },
      ],
    };
    const decisions: Decision[] = [...merges, { op: "exclude", tipo: "Cacao", reason: "Prueba" }];
    assert.deepEqual(warningsOf(decisions, [lacteos, redone]), [
      'decision 3 (exclude): Tipo "Cacao" was placed in "cacao-amargo" by part "desayuno"; the decision overrides it',
    ]);
  });

  it("warns about a doubt left with fewer than 2 candidates and about a name that differs between parts", () => {
    const renamed: Proposal = {
      ...desayuno,
      groups: [
        {
          ...desayuno.groups[0]!,
          productTypes: [
            desayuno.groups[0]!.productTypes[0]!,
            {
              id: "leche-entera",
              name: "Leche entera clásica",
              tipos: ["Leche larga vida entera"],
            },
          ],
        },
        desayuno.groups[1]!,
      ],
    };
    assert.deepEqual(
      warningsOf(
        [...merges, { op: "merge", from: "leche-en-polvo", into: "leche-entera" }],
        [lacteos, renamed],
      ),
      [
        'Product Type "leche-entera" is named "Leche entera" in part "lacteos" and "Leche entera clásica" in part "desayuno"; kept "Leche entera"',
        'doubt for Tipo "Leche en polvo entera" has fewer than 2 candidates after merges; place it or add a Product Type',
      ],
    );
  });

  it("renders a summary with Groups, Product Types, Tipos and product counts", () => {
    const summary = renderSummary(consolidated(merges));
    assert.match(summary, /## Leche `grupo-leche` \(25\)/);
    assert.match(
      summary,
      /- \*\*Leche entera\*\* `leche-entera` \(20\) \[desayuno, lacteos\]\n {2}- Leche entera \(10\)/,
    );
    assert.match(summary, /- Leche balsámica \(2\): Crema corporal/);
  });
});
