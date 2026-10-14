import assert from "node:assert/strict";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import { validateEvalSet } from "../../core/order-resolution/eval-set.ts";
import { validatePaymentCards } from "../../core/product-selection/payment-cards.ts";
import { validateProductTypes } from "../../core/product-types/validate.ts";
import { createDataFiles } from "./data-files.ts";

const repoRoot = join(import.meta.dirname, "../../..");

let root: string;

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
};

const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

const vocabulary = {
  groups: [{ id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] }],
};

const catalogProduct = (productId: string, department: string) => ({
  productId,
  skuIds: [`${productId}0`],
  name: `Yerba ${productId}`,
  brand: null,
  department,
  availableQuantity: 1,
  seccion: null,
  familia: null,
  tipo: "Yerba",
  measureUnit: null,
  consumptionQuantity: null,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "data-files-"));
  write("vocabulary/product-types.json", vocabulary);
  write("vocabulary/carrefour-tipos.json", { Yerba: "yerba" });
  write("vocabulary/carrefour-payment-cards.json", {
    cards: [{ names: ["Visa"], paymentSystem: "2", bin: null }],
  });
  write("evals/order-resolution.json", {
    cases: [{ id: "yerba", order: "una yerba", items: [{ productType: "yerba" }] }],
  });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the committed data", () => {
  it("loads with no errors", () => {
    const files = createDataFiles(repoRoot);
    assert.equal(files.loadProductTypes().ok, true);
    assert.equal(files.loadPaymentCards().ok, true);
    assert.equal(files.loadEvalSet().ok, true);
  });
});

describe("loadProductTypes", () => {
  it("returns the vocabulary and the mapping when they are valid", () => {
    assert.deepEqual(createDataFiles(root).loadProductTypes(), {
      ok: true,
      value: { vocabulary, mapping: { Yerba: "yerba" } },
    });
  });

  it("fails with the validator's errors for a broken schema or reference", () => {
    const brokenVocabulary = { groups: [{ id: "Grupo Yerba", productTypes: [] }] };
    const brokenMapping = { Yerba: "mate", Leche: "grupo-yerba" };
    write("vocabulary/product-types.json", brokenVocabulary);
    write("vocabulary/carrefour-tipos.json", brokenMapping);
    const expected = validateProductTypes(brokenVocabulary, brokenMapping);
    assert.ok(expected.length > 0);
    assert.deepEqual(createDataFiles(root).loadProductTypes(), { ok: false, errors: expected });

    const validVocabulary = {
      groups: [
        ...vocabulary.groups,
        { id: "grupo-leche", name: "Leche", productTypes: [{ id: "leche", name: "Leche" }] },
      ],
    };
    write("vocabulary/product-types.json", validVocabulary);
    assert.deepEqual(createDataFiles(root).loadProductTypes(), {
      ok: false,
      errors: [
        'Tipo "Yerba" maps to unknown Product Type "mate"',
        'Tipo "Leche" maps to Product Type Group "grupo-yerba" instead of a Product Type',
      ],
    });
  });
});

describe("loadPaymentCards", () => {
  it("fails with the validator's errors", () => {
    const table = {
      cards: [
        { names: ["Visa"], paymentSystem: "2", bin: null },
        { names: ["visa"], paymentSystem: "x", bin: null },
      ],
    };
    write("vocabulary/carrefour-payment-cards.json", table);
    assert.deepEqual(createDataFiles(root).loadPaymentCards(), {
      ok: false,
      errors: validatePaymentCards(table),
    });
  });

  it("fails on a name used twice", () => {
    write("vocabulary/carrefour-payment-cards.json", {
      cards: [
        { names: ["Visa"], paymentSystem: "2", bin: null },
        { names: ["visa"], paymentSystem: "4", bin: null },
      ],
    });
    assert.deepEqual(createDataFiles(root).loadPaymentCards(), {
      ok: false,
      errors: ['payment card name "visa" is used more than once'],
    });
  });
});

describe("loadEvalSet", () => {
  it("returns the eval set with the vocabulary it was checked against", () => {
    const loaded = createDataFiles(root).loadEvalSet();
    assert.equal(loaded.ok && loaded.value.evalSet.cases[0]?.id, "yerba");
    assert.deepEqual(loaded.ok && loaded.value.vocabulary, vocabulary);
  });

  it("fails on an unknown Product Type with the validator's errors", () => {
    const evalSet = {
      cases: [{ id: "mate", order: "un mate", items: [{ productType: "mate" }] }],
    };
    write("evals/order-resolution.json", evalSet);
    assert.deepEqual(createDataFiles(root).loadEvalSet(), {
      ok: false,
      errors: validateEvalSet(evalSet, vocabulary),
    });
  });

  it("fails with the vocabulary's errors when the vocabulary is invalid", () => {
    write("vocabulary/carrefour-tipos.json", { Yerba: "mate" });
    assert.deepEqual(createDataFiles(root).loadEvalSet(), {
      ok: false,
      errors: ['Tipo "Yerba" maps to unknown Product Type "mate"'],
    });
  });
});

describe("loadOrderFiles", () => {
  it("returns the grocery products of the Catalog Snapshot with the validated data", () => {
    write(".data/carrefour/products.json", {
      products: [catalogProduct("1", "Almacén"), catalogProduct("2", "Electro")],
    });
    const loaded = createDataFiles(root).loadOrderFiles();
    assert.deepEqual(loaded.ok && loaded.value.catalog.map(({ productId }) => productId), ["1"]);
  });

  it("fails with every error when data is missing or invalid", () => {
    write("vocabulary/carrefour-tipos.json", { Yerba: "mate" });
    write("vocabulary/carrefour-payment-cards.json", { cards: "none" });
    assert.deepEqual(createDataFiles(root).loadOrderFiles(), {
      ok: false,
      errors: [
        "No Catalog Snapshot at .data/carrefour/products.json. Run pnpm carrefour:catalog first.",
        'Tipo "Yerba" maps to unknown Product Type "mate"',
        "payment cards cards: Invalid input: expected array, received string",
      ],
    });
  });
});

describe("the seed files", () => {
  const part = {
    id: "almacen",
    department: "Almacén",
    tipos: [
      {
        tipo: "Yerba",
        products: 1,
        availableProducts: 1,
        familias: [],
        measureUnits: [],
        examples: ["Yerba 1"],
      },
    ],
  };

  it("saves parts, replacing the previous ones, and loads them back", () => {
    const files = createDataFiles(root);
    files.saveParts([{ ...part, id: "old" }]);
    files.saveParts([part]);
    assert.deepEqual(readdirSync(join(root, ".data/carrefour/seed/parts")), ["almacen.json"]);
    assert.deepEqual(files.loadParts(), [part]);
    assert.deepEqual(files.loadPart("almacen"), { ok: true, value: part });
    assert.deepEqual(files.loadPart("bebidas"), {
      ok: false,
      errors: ["Missing .data/carrefour/seed/parts/bebidas.json"],
    });
  });

  it("checks a proposal against its part", () => {
    const files = createDataFiles(root);
    assert.equal(files.hasProposal("almacen"), false);
    assert.deepEqual(files.loadProposal(part), {
      ok: false,
      errors: ["Missing .data/carrefour/seed/proposals/almacen.json"],
    });
    write(".data/carrefour/seed/proposals/almacen.json", { part: "almacen" });
    assert.equal(files.hasProposal("almacen"), true);
    const loaded = files.loadProposal(part);
    assert.equal(loaded.ok, false);
    const proposal = {
      part: "almacen",
      groups: [
        {
          id: "grupo-yerba",
          name: "Yerba",
          productTypes: [{ id: "yerba", name: "Yerba", tipos: ["Yerba"] }],
        },
      ],
      excluded: [],
      doubts: [],
    };
    write(".data/carrefour/seed/proposals/almacen.json", proposal);
    assert.deepEqual(files.loadProposal(part), { ok: true, value: proposal });
  });

  it("reads no decisions as an empty list and reports invalid ones with the path", () => {
    const files = createDataFiles(root);
    assert.deepEqual(files.loadDecisions(), { ok: true, value: [] });
    write(".data/carrefour/seed/decisions.json", { op: "merge" });
    assert.deepEqual(files.loadDecisions(), {
      ok: false,
      errors: [
        '.data/carrefour/seed/decisions.json at "": Invalid input: expected array, received object',
      ],
    });
  });

  it("fails to load doubts before a consolidation wrote them", () => {
    assert.deepEqual(createDataFiles(root).loadDoubts(), {
      ok: false,
      errors: ["No .data/carrefour/seed/doubts.json. Run pnpm seed:consolidate first."],
    });
  });

  it("writes a consolidation and reads its doubts back", () => {
    mkdirSync(join(root, ".data/carrefour/seed"), { recursive: true });
    const files = createDataFiles(root);
    const written = files.saveConsolidation({
      vocabulary,
      mapping: { Yerba: "yerba" },
      doubts: [],
      tree: [],
      excluded: [],
    });
    assert.deepEqual(written, [
      "vocabulary/product-types.json",
      "vocabulary/carrefour-tipos.json",
      ".data/carrefour/seed/doubts.json",
      ".data/carrefour/seed/summary.md",
    ]);
    assert.deepEqual(read("vocabulary/carrefour-tipos.json"), { Yerba: "yerba" });
    assert.deepEqual(files.loadDoubts(), { ok: true, value: [] });
  });
});

describe("the eval runs", () => {
  const run = (startedAt: string) => ({
    startedAt,
    model: "claude-haiku-5-5",
    filters: [],
    durationMs: 1,
    costUsd: 0,
    sessions: 0,
    cases: [],
  });

  it("has no latest run before the first one", () => {
    assert.equal(createDataFiles(root).loadLatestEvalRun(), null);
  });

  it("saves each run under its start time and reads back the latest", () => {
    const files = createDataFiles(root);
    const path = files.saveEvalRun(run("2026-10-13T10:00:00.000Z"));
    files.saveEvalRun(run("2026-10-14T10:00:00.000Z"));
    assert.equal(path, ".data/order-resolution/eval-runs/2026-10-13T10-00-00.000Z.json");
    assert.deepEqual(files.loadLatestEvalRun(), {
      startedAt: "2026-10-14T10:00:00.000Z",
      cases: [],
    });
  });
});

describe("saveCatalog", () => {
  it("writes the products and the Tipos with the metadata into the output directory", () => {
    const files = createDataFiles(root);
    const outputDir = files.saveCatalog(
      { meta: { source: "carrefour" }, products: [{ productId: "1" }], tipos: [{ tipo: "Yerba" }] },
      "catalog",
    );
    assert.equal(outputDir, "catalog");
    assert.deepEqual(read("catalog/products.json"), {
      source: "carrefour",
      products: [{ productId: "1" }],
    });
    assert.deepEqual(read("catalog/tipos.json"), {
      source: "carrefour",
      tipos: [{ tipo: "Yerba" }],
    });
  });

  it("writes into the Catalog Snapshot folder by default", () => {
    assert.equal(
      createDataFiles(root).saveCatalog({ meta: {}, products: [], tipos: [] }),
      ".data/carrefour",
    );
    assert.deepEqual(read(".data/carrefour/products.json"), { products: [] });
  });
});

describe("promptsDir", () => {
  it("points at the order resolution prompts", () => {
    cpSync(join(repoRoot, "prompts"), join(root, "prompts"), { recursive: true });
    assert.ok(readdirSync(createDataFiles(root).promptsDir).length > 0);
  });
});
