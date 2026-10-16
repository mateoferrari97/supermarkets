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
import { summarize } from "../../core/order-matching/eval-score.ts";
import { summarizePlanning } from "../../core/planning/eval-score.ts";
import { createDataFiles } from "./data-files.ts";

const repoRoot = join(import.meta.dirname, "../../..");

let root: string;

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
};

const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

const yerbaCase = {
  id: "yerba",
  order: "una yerba",
  items: [{ product: "Yerba", brand: null, size: "common", quantity: "minimum", fits: ["1"] }],
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
  write("evals/order-matching.json", { cases: [yerbaCase] });
  write("prompts/order-matching/parse-order.md", "# Examples\n\n<order>\nyerba y sal\n</order>\n");
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the committed data", () => {
  it("loads with no errors", () => {
    const files = createDataFiles(repoRoot);
    assert.equal(files.loadEvalSet().ok, true);
    assert.equal(files.loadPlanningEvalSet().ok, true);
  });
});

describe("loadEvalSet", () => {
  it("returns the eval set when it is valid", () => {
    assert.deepEqual(createDataFiles(root).loadEvalSet(), {
      ok: true,
      value: { cases: [yerbaCase] },
    });
  });

  it("fails with the validator's errors", () => {
    write("evals/order-matching.json", { cases: [yerbaCase, yerbaCase] });
    assert.deepEqual(createDataFiles(root).loadEvalSet(), {
      ok: false,
      errors: ['eval case "yerba" id is used more than once'],
    });
  });

  it("rejects an order equal to an example order of any prompt", () => {
    write("evals/order-matching.json", { cases: [{ ...yerbaCase, order: "Yerba y sal" }] });
    assert.deepEqual(createDataFiles(root).loadEvalSet(), {
      ok: false,
      errors: ['eval case "yerba" order is an example order of the prompts'],
    });
  });
});

describe("loadPlanningEvalSet", () => {
  const offTopic = { id: "boca", message: "¿juega Boca?", topic: "off-topic" };
  const lasagna = {
    id: "lasagna",
    message: "lasaña para 4",
    covers: ["recipe", "event", "weekly-menu", "gift", "advice", "constraints", "idea-in-cart"],
    plan: true,
  };

  beforeEach(() => {
    write("evals/planning.json", { routes: [offTopic], plans: [lasagna] });
    write(
      "prompts/planning/plan.md",
      "# Examples\n\n<conversation>\n<owner>quiero hacer ñoquis</owner>\n</conversation>\n",
    );
  });

  it("returns the planning eval set when it is valid", () => {
    assert.deepEqual(createDataFiles(root).loadPlanningEvalSet(), {
      ok: true,
      value: { routes: [offTopic], plans: [lasagna] },
    });
  });

  it("fails with the validator's errors", () => {
    write("evals/planning.json", { routes: [offTopic, offTopic], plans: [lasagna] });
    assert.deepEqual(createDataFiles(root).loadPlanningEvalSet(), {
      ok: false,
      errors: ['routing case "boca" id is used more than once'],
    });
  });

  it("rejects a message equal to an example message of any prompt", () => {
    write("evals/planning.json", {
      routes: [offTopic],
      plans: [{ ...lasagna, message: "Quiero hacer ñoquis" }],
    });
    assert.deepEqual(createDataFiles(root).loadPlanningEvalSet(), {
      ok: false,
      errors: ['plan case "lasagna" message is an example message of the prompts'],
    });
  });

  it("saves each run under its start time", () => {
    const run = {
      startedAt: "2026-10-16T10:00:00.000Z",
      snapshotFetchedAt: null,
      models: [],
      runsPerCase: 1,
      filters: [],
      durationMs: 1,
      costUsd: 0,
      sessions: 0,
      stale: [],
      totals: summarizePlanning([], []),
      routes: [],
      plans: [],
    };
    const path = createDataFiles(root).savePlanningEvalRun(run);
    assert.equal(path, ".data/planning/eval-runs/2026-10-16T10-00-00.000Z.json");
    assert.deepEqual(read(path), run);
  });
});

describe("loadSnapshotFetchedAt", () => {
  it("reads the date of the Catalog Snapshot, or null without one", () => {
    assert.equal(createDataFiles(root).loadSnapshotFetchedAt(), null);
    write(".data/carrefour/products.json", { fetchedAt: "2026-10-15T20:44:49.211Z", products: [] });
    assert.equal(createDataFiles(root).loadSnapshotFetchedAt(), "2026-10-15T20:44:49.211Z");
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

describe("the eval runs", () => {
  const run = (startedAt: string) => ({
    startedAt,
    snapshotFetchedAt: null,
    models: ["claude-sonnet-5-5"],
    runsPerCase: 3,
    filters: [],
    durationMs: 1,
    costUsd: 0,
    sessions: 0,
    stale: [],
    totals: summarize([]),
    cases: [{ id: "yerba", order: "una yerba", expectedToFail: null, passed: true, runs: [] }],
    answers: [],
  });

  it("has no latest run before the first one", () => {
    assert.equal(createDataFiles(root).loadLatestEvalRun(), null);
  });

  it("saves each run under its start time and reads back the latest", () => {
    const files = createDataFiles(root);
    const path = files.saveEvalRun(run("2026-10-13T10:00:00.000Z"));
    files.saveEvalRun(run("2026-10-14T10:00:00.000Z"));
    assert.equal(path, ".data/order-matching/eval-runs/2026-10-13T10-00-00.000Z.json");
    assert.deepEqual(files.loadLatestEvalRun(), {
      startedAt: "2026-10-14T10:00:00.000Z",
      cases: [{ id: "yerba", passed: true }],
    });
  });
});

describe("saveCatalog", () => {
  it("writes the products with the metadata into the output directory", () => {
    const files = createDataFiles(root);
    const outputDir = files.saveCatalog(
      { meta: { source: "carrefour" }, products: [{ productId: "1" }] },
      "catalog",
    );
    assert.equal(outputDir, "catalog");
    assert.deepEqual(read("catalog/products.json"), {
      source: "carrefour",
      products: [{ productId: "1" }],
    });
    assert.deepEqual(readdirSync(join(root, "catalog")), ["products.json"]);
  });

  it("writes into the Catalog Snapshot folder by default", () => {
    assert.equal(createDataFiles(root).saveCatalog({ meta: {}, products: [] }), ".data/carrefour");
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

describe("the Chat messages", () => {
  const owner = { role: "owner", at: "2026-10-16T12:00:00.000Z", text: "hola" } as const;
  const assistant = { role: "assistant", at: "2026-10-16T12:00:05.000Z", text: "Hola" } as const;

  it("is empty before the first message", () => {
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [] });
  });

  it("reads back the messages saved, oldest first, from another instance", () => {
    createDataFiles(root).appendChatMessage(owner);
    createDataFiles(root).appendChatMessage(assistant);
    assert.deepEqual(createDataFiles(root).loadChatMessages(), {
      ok: true,
      value: [owner, assistant],
    });
  });

  it("refuses to save an invalid message", () => {
    assert.throws(() => createDataFiles(root).appendChatMessage({ ...owner, text: "" }));
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [] });
  });

  it("fails naming the line of a line that is not JSON or not a message", () => {
    const valid = JSON.stringify(owner);
    mkdirSync(join(root, ".data/chat"), { recursive: true });
    writeFileSync(
      join(root, ".data/chat/messages.jsonl"),
      `${valid}\nnot json\n${JSON.stringify({ ...owner, role: "system" })}\n`,
    );
    const loaded = createDataFiles(root).loadChatMessages();
    assert.equal(loaded.ok, false);
    if (loaded.ok) return;
    assert.equal(loaded.errors.length, 2);
    assert.match(loaded.errors[0] ?? "", /messages\.jsonl line 2 is not JSON/);
    assert.match(loaded.errors[1] ?? "", /line 3 is not a message \(at "role"/);
  });
});

describe("the Profile", () => {
  it("is null before the postal code is told", () => {
    assert.deepEqual(createDataFiles(root).loadProfile(), { ok: true, value: null });
  });

  it("reads back the Profile saved from another instance, the last one winning", () => {
    createDataFiles(root).saveProfile({ postalCode: "1425" });
    createDataFiles(root).saveProfile({ postalCode: "5000" });
    assert.deepEqual(createDataFiles(root).loadProfile(), {
      ok: true,
      value: { postalCode: "5000" },
    });
  });

  it("refuses to save an invalid Profile and keeps the saved one", () => {
    createDataFiles(root).saveProfile({ postalCode: "1425" });
    assert.throws(() => createDataFiles(root).saveProfile({ postalCode: "abc" }));
    assert.deepEqual(createDataFiles(root).loadProfile(), {
      ok: true,
      value: { postalCode: "1425" },
    });
  });

  it("fails naming the file when it is not JSON or not a Profile", () => {
    mkdirSync(join(root, ".data/chat"), { recursive: true });
    writeFileSync(join(root, ".data/chat/profile.json"), "{bad");
    const notJson = createDataFiles(root).loadProfile();
    assert.equal(notJson.ok, false);
    if (!notJson.ok) assert.match(notJson.errors[0] ?? "", /profile\.json is not JSON/);
    writeFileSync(join(root, ".data/chat/profile.json"), JSON.stringify({ postalCode: 1425 }));
    const notProfile = createDataFiles(root).loadProfile();
    assert.equal(notProfile.ok, false);
    if (!notProfile.ok) {
      assert.match(notProfile.errors[0] ?? "", /profile\.json is not a profile \(at "postalCode"/);
    }
  });
});

describe("the Orders", () => {
  const order = {
    id: "order-1",
    status: "proposed" as const,
    openedAt: "2026-10-16T12:00:00.000Z",
    items: [{ kind: "none" as const, ref: "1", description: "bicicleta", note: "No encontré." }],
    proposals: 1,
    proposal: null,
  };

  it("is an empty list before anything is saved", () => {
    assert.deepEqual(createDataFiles(root).loadOrders(), { ok: true, value: [] });
  });

  it("reads back the Orders saved from another instance, the last save winning", () => {
    createDataFiles(root).saveOrders([order]);
    createDataFiles(root).saveOrders([order, { ...order, id: "order-2", status: "closed" }]);
    const loaded = createDataFiles(root).loadOrders();
    assert.equal(loaded.ok && loaded.value.length, 2);
    assert.deepEqual(loaded.ok && loaded.value[0], order);
  });

  it("refuses to save an invalid Order and keeps the saved ones", () => {
    createDataFiles(root).saveOrders([order]);
    assert.throws(() => createDataFiles(root).saveOrders([{ ...order, status: "open" as never }]));
    const loaded = createDataFiles(root).loadOrders();
    assert.equal(loaded.ok && loaded.value.length, 1);
  });

  it("fails naming the file when it is not JSON or not a list of orders", () => {
    write(".data/chat/orders.json", "{bad");
    const notJson = createDataFiles(root).loadOrders();
    assert.equal(notJson.ok, false);
    if (!notJson.ok) assert.match(notJson.errors[0] ?? "", /orders\.json is not JSON/);
    write(".data/chat/orders.json", [{ ...order, status: "open" }]);
    const notOrders = createDataFiles(root).loadOrders();
    assert.equal(notOrders.ok, false);
    if (!notOrders.ok) {
      assert.match(
        notOrders.errors[0] ?? "",
        /orders\.json is not a list of orders \(at "0\.status"/,
      );
    }
  });
});

describe("a message with a proposal", () => {
  it("is saved with its parts and read back", () => {
    const line = {
      description: "leche",
      productId: "2",
      itemId: "20",
      name: "Leche",
      brand: null,
      quantity: 1,
      unitPrice: 800,
      total: 800,
      reason: "Es el más barato.",
      notes: [],
    };
    const message = {
      role: "assistant" as const,
      at: "2026-10-16T12:00:00.000Z",
      text: "Armé este pedido",
      parts: [
        {
          type: "proposal" as const,
          proposal: { id: "order-1-1", lines: [line], notes: [], total: 800 },
        },
      ],
    };
    createDataFiles(root).appendChatMessage(message);
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [message] });
  });
});

describe("a message with a cart and an Order that holds it", () => {
  it("are saved and read back", () => {
    const line = {
      description: "leche",
      productId: "2",
      itemId: "20",
      name: "Leche",
      brand: null,
      quantity: 1,
      unitPrice: 800,
      total: 800,
      reason: "Es el más barato.",
      notes: [],
    };
    const cart = {
      postalCode: "1425",
      lines: [line],
      notes: [],
      total: 800,
      warning: "Vaciá tu carrito.",
      cartLink: "https://example.test/cart",
    };
    const message = {
      role: "assistant" as const,
      at: "2026-10-16T12:00:00.000Z",
      text: "Listo",
      parts: [{ type: "cart" as const, cart }],
    };
    const order = {
      id: "order-1",
      status: "closed" as const,
      openedAt: "2026-10-16T12:00:00.000Z",
      items: [],
      proposals: 1,
      proposal: { id: "order-1-1", lines: [line], notes: [], total: 800 },
      cart,
    };
    const files = createDataFiles(root);
    files.appendChatMessage(message);
    files.saveOrders([order]);
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [message] });
    assert.deepEqual(createDataFiles(root).loadOrders(), { ok: true, value: [order] });
  });
});
