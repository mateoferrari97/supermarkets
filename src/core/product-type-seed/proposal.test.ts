import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { validateProposal } from "./proposal.ts";
import type { Part, PartTipo } from "./split.ts";

const tipo = (name: string): PartTipo => ({
  tipo: name,
  products: 1,
  availableProducts: 1,
  familias: [],
  measureUnits: [],
  examples: [],
});

const part: Part = {
  id: "lacteos",
  department: "Lácteos y productos frescos",
  tipos: [
    tipo("Leche entera"),
    tipo("Leches"),
    tipo("Leche en polvo entera"),
    tipo("Leche balsámica"),
  ],
};

const proposal = {
  part: "lacteos",
  groups: [
    {
      id: "leche",
      name: "Leche",
      productTypes: [
        { id: "leche-entera", name: "Leche entera", tipos: ["Leche entera", "Leches"] },
        { id: "leche-en-polvo", name: "Leche en polvo", tipos: [] as string[] },
      ],
    },
  ],
  excluded: [{ tipo: "Leche balsámica", reason: "Crema corporal" }],
  doubts: [
    {
      tipo: "Leche en polvo entera",
      candidates: ["leche-en-polvo", "leche-entera"],
      reason: "Mezcla leche en polvo con leche larga vida",
    },
  ],
};

const withPowderTipo = (overrides: Partial<typeof proposal>) => ({
  ...proposal,
  groups: [
    {
      ...proposal.groups[0],
      productTypes: [
        proposal.groups[0]!.productTypes[0]!,
        { id: "leche-en-polvo", name: "Leche en polvo", tipos: ["Leche en polvo"] },
      ],
    },
  ],
  ...overrides,
});

const partWithPowder: Part = { ...part, tipos: [...part.tipos, tipo("Leche en polvo")] };

describe("validateProposal", () => {
  it("accepts a proposal that places every Tipo exactly once", () => {
    assert.deepEqual(validateProposal(withPowderTipo({}), partWithPowder), []);
  });

  it("accepts a Product Type without Tipos when a doubt names it", () => {
    assert.deepEqual(validateProposal(proposal, part), []);
  });

  it("rejects a Product Type without Tipos that no doubt names", () => {
    const unnamed = {
      ...proposal,
      doubts: [{ ...proposal.doubts[0]!, candidates: ["leche-entera", "excluded"] }],
    };
    assert.deepEqual(validateProposal(unnamed, part), [
      'Product Type "leche-en-polvo" has no Tipos and no doubt names it',
    ]);
  });

  it("rejects a missing Tipo, a repeated Tipo and a Tipo from another part", () => {
    const broken = withPowderTipo({
      excluded: [
        { tipo: "Leches", reason: "Duplicado" },
        { tipo: "Cordones", reason: "No es de supermercado" },
      ],
    });
    assert.deepEqual(validateProposal(broken, partWithPowder), [
      'Tipo "Leches" appears 2 times',
      'Tipo "Leche balsámica" is missing from the proposal',
      'Tipo "Cordones" is not in part "lacteos"',
    ]);
  });

  it("rejects a doubt whose candidate is not a Product Type of the proposal", () => {
    const broken = withPowderTipo({
      doubts: [
        { tipo: "Leche en polvo entera", candidates: ["leche", "excluded"], reason: "Duda" },
      ],
    });
    assert.deepEqual(validateProposal(broken, partWithPowder), [
      'doubt for Tipo "Leche en polvo entera" names unknown candidate "leche"',
    ]);
  });

  it("rejects malformed and repeated ids and a proposal for another part", () => {
    const broken = withPowderTipo({
      part: "bebidas",
      groups: [
        {
          id: "Leche",
          name: "Leche",
          productTypes: [
            { id: "leche-entera", name: "Leche entera", tipos: ["Leche entera", "Leches"] },
            { id: "leche-entera", name: "Leche en polvo", tipos: ["Leche en polvo"] },
          ],
        },
      ],
      doubts: [
        { tipo: "Leche en polvo entera", candidates: ["leche-entera", "excluded"], reason: "Duda" },
      ],
    });
    assert.deepEqual(validateProposal(broken, partWithPowder), [
      'proposal is for part "bebidas", expected "lacteos"',
      'Product Type Group id "Leche" is not a lowercase hyphenated slug',
      'Product Type id "leche-entera" is used more than once',
    ]);
  });

  it("rejects the reserved id excluded", () => {
    const reserved = withPowderTipo({
      groups: [
        {
          ...proposal.groups[0]!,
          productTypes: [
            proposal.groups[0]!.productTypes[0]!,
            { id: "excluded", name: "Excluido", tipos: ["Leche en polvo"] },
          ],
        },
      ],
      doubts: [{ ...proposal.doubts[0]!, candidates: ["leche-entera", "excluded"] }],
    });
    assert.deepEqual(validateProposal(reserved, partWithPowder), [
      'Product Type id "excluded" is reserved for exclusion',
    ]);
  });

  it("rejects a doubt with a single candidate", () => {
    const single = {
      ...proposal,
      doubts: [{ ...proposal.doubts[0]!, candidates: ["leche-en-polvo"] }],
    };
    assert.ok(
      validateProposal(single, part).some((error) =>
        error.startsWith('proposal at "doubts.0.candidates"'),
      ),
    );
  });

  it("rejects a proposal with the wrong shape", () => {
    const errors = validateProposal({ part: "lacteos", groups: [], excluded: [] }, part);
    assert.ok(errors.some((error) => error.startsWith('proposal at "doubts"')));
  });
});
