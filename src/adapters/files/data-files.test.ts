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
import { createDataFiles } from "./data-files.ts";

const repoRoot = join(import.meta.dirname, "../../..");

let root: string;

const write = (path: string, value: unknown) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
};

const read = (path: string): unknown => JSON.parse(readFileSync(join(root, path), "utf8"));

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
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("the committed data", () => {
  it("loads with no errors", () => {
    const files = createDataFiles(repoRoot);
    assert.equal(files.loadAgentEvalSet().ok, true);
  });
});

describe("loadAgentEvalSet", () => {
  const stories = [
    "postal-code-once",
    "change-postal-code",
    "add-to-past-order",
    "repeat-order",
    "precise-product",
    "more-options",
    "one-round",
    "confirm-first",
    "correction",
    "plan",
    "off-topic",
  ];
  const everything = {
    id: "everything",
    covers: stories,
    setup: { postalCode: "1425" },
    turns: [{ owner: "hola", ends: "text" }],
  };

  it("returns the agent eval set when it is valid", () => {
    write("evals/agent.json", { cases: [everything] });
    assert.deepEqual(createDataFiles(root).loadAgentEvalSet(), {
      ok: true,
      value: { cases: [everything] },
    });
  });

  it("fails with the validator's errors", () => {
    write("evals/agent.json", { cases: [everything, everything] });
    assert.deepEqual(createDataFiles(root).loadAgentEvalSet(), {
      ok: false,
      errors: ['case "everything" id is used more than once'],
    });
  });

  it("saves each run under its start time", () => {
    const run = {
      startedAt: "2026-10-16T10:00:00.000Z",
      snapshotFetchedAt: null,
      models: [],
      runsPerCase: 1,
      filters: [],
      durationMs: 0,
      costUsd: 0,
      sessions: 0,
      stale: [],
      totals: { cases: { hits: 0, total: 0 }, errors: { hits: 0, total: 0 } },
      unexpectedFailures: [],
      cases: [],
    };
    const path = createDataFiles(root).saveAgentEvalRun(run);
    assert.equal(path, ".data/agent/eval-runs/2026-10-16T10-00-00.000Z.json");
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
  it("points at the prompts", () => {
    cpSync(join(repoRoot, "prompts"), join(root, "prompts"), { recursive: true });
    assert.ok(readdirSync(createDataFiles(root).promptsDir).length > 0);
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

describe("a message with a round and an Order that waits for a choice", () => {
  it("are saved and read back", () => {
    const round = {
      questions: [
        {
          number: 1,
          ref: "1",
          text: "¿Qué yogur querés?",
          options: [
            { label: "Yogur frutilla Ilolay", productId: "11", price: 500 },
            { label: "Otro", productId: null, price: null },
          ],
          recommended: 1,
        },
      ],
    };
    const message = {
      role: "assistant" as const,
      at: "2026-10-16T12:00:00.000Z",
      text: "Necesito que me confirmes algunas cosas",
      parts: [{ type: "round" as const, round }],
    };
    const order = {
      id: "order-1",
      status: "draft" as const,
      openedAt: "2026-10-16T12:00:00.000Z",
      items: [
        {
          kind: "choose" as const,
          ref: "1",
          description: "yogur",
          brand: null,
          size: "common",
          quantity: "minimum",
          alternatives: [
            {
              productId: "11",
              itemId: "110",
              name: "Yogur frutilla Ilolay",
              brand: "Ilolay",
              department: "Lácteos",
              tipo: null,
              price: 500,
              inStock: true,
              sale: {
                kind: "packaged" as const,
                size: { dimension: "weight" as const, amount: 190 },
              },
              teasers: [{ name: "2x1", minimumQuantity: 2 }],
            },
          ],
          shown: ["11"],
        },
      ],
      proposals: 0,
      proposal: null,
    };
    const files = createDataFiles(root);
    files.appendChatMessage(message);
    files.saveOrders([order]);
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [message] });
    assert.deepEqual(createDataFiles(root).loadOrders(), { ok: true, value: [order] });
  });

  it("rejects a round whose recommended option does not exist", () => {
    write(
      ".data/chat/messages.jsonl",
      `${JSON.stringify({
        role: "assistant",
        at: "2026-10-16T12:00:00.000Z",
        text: "x",
        parts: [
          {
            type: "round",
            round: {
              questions: [
                {
                  number: 1,
                  ref: null,
                  text: "¿Hoy?",
                  options: [{ label: "Sí", productId: null, price: null }],
                  recommended: 2,
                },
              ],
            },
          },
        ],
      })}\n`,
    );
    const loaded = createDataFiles(root).loadChatMessages();
    assert.equal(loaded.ok, false);
  });
});

describe("a Plan proposal and an Order that holds its products seen", () => {
  it("are saved and read back", () => {
    const line = {
      description: "para la salsa",
      productId: "12",
      itemId: "120",
      name: "Carne picada especial x kg",
      brand: null,
      quantity: 2,
      unitPrice: 4500,
      total: 9000,
      reason: "Carne común",
      notes: [],
    };
    const proposal = {
      id: "order-1-1",
      lines: [line],
      notes: [],
      total: 9000,
      idea: { title: "Lasaña para 4", sections: [{ heading: "Pasos", text: "Armá las capas." }] },
      overBudget: { budget: 8000, total: 9000, over: 1000 },
    };
    const message = {
      role: "assistant" as const,
      at: "2026-10-16T12:00:00.000Z",
      text: "Lasaña para 4",
      parts: [{ type: "proposal" as const, proposal }],
    };
    const order = {
      id: "order-1",
      status: "proposed" as const,
      openedAt: "2026-10-16T12:00:00.000Z",
      items: [],
      proposals: 1,
      proposal,
      seen: [
        {
          productId: "12",
          itemId: "120",
          name: "Carne picada especial x kg",
          brand: null,
          department: "Carnes",
          tipo: "Carne picada",
          price: 9000,
          inStock: true,
          sale: { kind: "by-weight" as const, saleStepKg: 0.5 },
          teasers: [],
        },
      ],
    };
    const files = createDataFiles(root);
    files.appendChatMessage(message);
    files.saveOrders([order]);
    assert.deepEqual(createDataFiles(root).loadChatMessages(), { ok: true, value: [message] });
    assert.deepEqual(createDataFiles(root).loadOrders(), { ok: true, value: [order] });
  });
});
