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

const catalogProduct = (
  productId: string,
  department: string,
  fields: Record<string, unknown> = {},
) => ({
  productId,
  skuIds: [`${productId}0`],
  name: `Yerba ${productId}`,
  brand: null,
  department,
  availableQuantity: 1,
  seccion: null,
  familia: null,
  tipo: "Yerba",
  price: 1000,
  measureUnit: null,
  consumptionQuantity: null,
  measurementUnit: "un",
  unitMultiplier: 1,
  teasers: [],
  ...fields,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "data-files-"));
  write("vocabulary/product-types.json", vocabulary);
  write("vocabulary/carrefour-tipos.json", { Yerba: "yerba" });
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
    assert.deepEqual(createDataFiles(root).loadOrderFiles(), {
      ok: false,
      errors: [
        "No Catalog Snapshot at .data/carrefour/products.json. Run pnpm carrefour:catalog first.",
        'Tipo "Yerba" maps to unknown Product Type "mate"',
      ],
    });
  });
});

describe("loadCatalogProducts", () => {
  const load = (...products: unknown[]) => {
    write(".data/carrefour/products.json", { products });
    return createDataFiles(root).loadCatalogProducts();
  };

  it("reads a product sold by weight with its Sale Step and no size", () => {
    const loaded = load(
      catalogProduct("719074", "Frutas y verduras", {
        name: "Banana selección x kg.",
        tipo: "Banana",
        price: 1999,
        measureUnit: "GRM",
        consumptionQuantity: "1000.00",
        measurementUnit: "kg",
        unitMultiplier: 0.5,
      }),
    );
    assert.deepEqual(loaded, {
      ok: true,
      value: [
        {
          productId: "719074",
          itemId: "7190740",
          name: "Banana selección x kg.",
          brand: null,
          department: "Frutas y verduras",
          tipo: "Banana",
          price: 1999,
          inStock: true,
          sale: { kind: "by-weight", saleStepKg: 0.5 },
          teasers: [],
        },
      ],
    });
  });

  it("reads a packaged product's size from its measure, normalized, with its teasers", () => {
    const teasers = [{ name: "PROMO-2do al 50%", minimumQuantity: 2 }];
    const loaded = load(
      catalogProduct("30138", "Bebidas", {
        name: "Gaseosa cola Coca Cola sabor original 1,5 lts",
        brand: "Coca Cola",
        availableQuantity: 0,
        measureUnit: "CM3",
        consumptionQuantity: "1500",
        teasers,
      }),
    );
    assert.deepEqual(
      loaded.ok &&
        loaded.value.map(({ brand, inStock, sale, teasers }) => ({
          brand,
          inStock,
          sale,
          teasers,
        })),
      [
        {
          brand: "Coca Cola",
          inStock: false,
          sale: { kind: "packaged", size: { dimension: "volume", amount: 1500 } },
          teasers,
        },
      ],
    );
  });

  it("gives no size to a product without a measure, whatever its name says", () => {
    const loaded = load(
      catalogProduct("1", "Bebidas", { name: "Gaseosa cola Pepsi en lata 354 ml" }),
    );
    assert.deepEqual(loaded.ok && loaded.value.map(({ sale }) => sale), [
      { kind: "packaged", size: null },
    ]);
  });

  it("keeps a product without tipo", () => {
    const loaded = load(catalogProduct("1", "Almacén", { tipo: null }));
    assert.deepEqual(
      loaded.ok && loaded.value.map(({ productId, tipo }) => ({ productId, tipo })),
      [{ productId: "1", tipo: null }],
    );
  });

  it("fails on a record of an older download and tells to download it again", () => {
    const {
      measurementUnit: _measurementUnit,
      unitMultiplier: _unitMultiplier,
      teasers: _teasers,
      ...old
    } = catalogProduct("1", "Almacén");
    assert.deepEqual(load(old), {
      ok: false,
      errors: [
        "The Catalog Snapshot at .data/carrefour/products.json does not have what this version " +
          'reads (at "products.0.measurementUnit": Invalid input: expected string, received undefined). ' +
          "Run pnpm carrefour:catalog again.",
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

describe("openConversationLog", () => {
  const startedAt = new Date(2026, 9, 15, 9, 5, 7);

  it("names the file after the local start time and the session id", () => {
    const log = createDataFiles(root).openConversationLog("abc-123", startedAt);
    assert.equal(log.path, join(".data/conversations", "2026-10-15-090507-abc-123.jsonl"));
  });

  it("appends one JSON line per event, each with an ISO timestamp", () => {
    const log = createDataFiles(root).openConversationLog("abc-123", startedAt);

    log.write({ type: "conversation-started", sessionId: "abc-123", commit: null });
    log.write({ type: "owner-message", text: "1425" });

    const lines = readFileSync(join(root, log.path), "utf8")
      .trimEnd()
      .split("\n")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(lines.length, 2);
    assert.match(String(lines[0]!.at), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.deepEqual(
      lines.map((line) => Object.fromEntries(Object.entries(line).filter(([key]) => key !== "at"))),
      [
        { type: "conversation-started", sessionId: "abc-123", commit: null },
        { type: "owner-message", text: "1425" },
      ],
    );
  });

  it("reports a failed write instead of throwing", () => {
    write(".data/conversations", "not a folder");
    const reported: string[] = [];
    const log = createDataFiles(root).openConversationLog("abc-123", startedAt, (message) =>
      reported.push(message),
    );

    log.write({ type: "owner-message", text: "1425" });

    assert.deepEqual(reported, [`Could not write the Conversation Log ${log.path}`]);
  });
});

describe("headCommit", () => {
  it("returns the commit checked out in the repo", () => {
    assert.match(createDataFiles(repoRoot).headCommit() ?? "", /^[0-9a-f]{40}$/);
  });

  it("returns null outside a git repository", () => {
    assert.equal(createDataFiles(root).headCommit(), null);
  });
});
