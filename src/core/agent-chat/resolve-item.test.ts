import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { stepsFrom } from "../order-conversation/steps.ts";
import { matchItems } from "../order-matching/match-items.ts";
import { parseLine } from "../order-matching/item.ts";
import { simulateCart } from "../product-selection/cart.ts";
import { candidatesFor } from "../product-selection/selection.ts";
import {
  catalog,
  llmFitting,
  memoryOrders,
  product,
  searchOf,
  storeOf,
} from "./agent-chat-fixtures.ts";
import type { ChatOrder } from "./order.ts";
import { resolveItem, type ResolveItemDependencies } from "./resolve-item.ts";

const signal = new AbortController().signal;
const now = () => new Date("2026-10-16T12:00:00.000Z");

function setup(overrides: Partial<ResolveItemDependencies> = {}, orders: ChatOrder[] = []) {
  const { search, searched } = searchOf(catalog);
  const { store, simulated } = storeOf(catalog);
  const memory = memoryOrders(orders);
  const dependencies: ResolveItemDependencies = {
    search,
    llm: llmFitting(),
    store,
    orders: memory.orders,
    loadProfile: () => ({ postalCode: "1425" }),
    now,
    ...overrides,
  };
  return { dependencies, searched, simulated, current: memory.current };
}

describe("resolveItem", () => {
  it("picks the same product today's order flow buys for the same Item", async () => {
    const { dependencies } = setup();
    const output = await resolveItem({ description: "leche" }, dependencies, signal);

    const parsed = parseLine({
      original: "leche",
      product: "leche",
      brand: null,
      size: "common",
      quantity: "minimum",
    });
    assert.ok(parsed.ok);
    const [match] = await matchItems([parsed.item], dependencies, stepsFrom());
    const { bought } = await simulateCart(
      [
        {
          kind: "choose",
          original: "leche",
          note: match!.note,
          candidates: candidatesFor(parsed.item, match!.fits),
        },
      ],
      "1425",
      dependencies.store,
      signal,
    );
    const expected = bought[0];
    assert.equal(expected?.kind, "bought");
    assert.equal(output.kind, "picked");
    if (output.kind === "picked" && expected?.kind === "bought") {
      assert.equal(output.product.productId, expected.line.product.productId);
      assert.equal(output.product.productId, "2");
      assert.equal(output.quantity, expected.line.quantity);
      assert.equal(output.total, expected.line.total);
      assert.equal(output.unitPrice, 800);
    }
  });

  it("passes the brand, the size and the quantity to the search and the pick", async () => {
    const { dependencies, searched } = setup();
    const output = await resolveItem(
      { description: "leche", brand: "Verónica", size: "1 l", quantity: "3 unit" },
      dependencies,
      signal,
    );
    assert.deepEqual(searched, ["leche"]);
    assert.equal(output.kind, "picked");
    if (output.kind === "picked") assert.equal(output.quantity, 3);
  });

  it("gives call 2 the brand in the Owner's words, once", async () => {
    const originals: string[] = [];
    const { dependencies } = setup({
      llm: llmFitting(({ item }) => {
        originals.push(item.original);
        return {};
      }),
    });
    await resolveItem({ description: "leche", brand: "Verónica" }, dependencies, signal);
    await resolveItem({ description: "leche verónica", brand: "Verónica" }, dependencies, signal);
    await resolveItem({ description: "leche" }, dependencies, signal);
    assert.deepEqual(originals, ["leche Verónica", "leche verónica", "leche"]);
  });

  it("answers none when no product fits and nothing else was found, without simulating", async () => {
    const { dependencies, simulated } = setup({
      llm: llmFitting(() => ({ fits: [], closest: [], question: "¿Cuál?" })),
      search: searchOf([]).search,
    });
    const output = await resolveItem({ description: "leche" }, dependencies, signal);
    assert.deepEqual(output, { kind: "none", ref: "1", note: 'No encontré "leche".' });
    assert.deepEqual(simulated, []);
  });

  it("answers none when the search finds nothing", async () => {
    const { dependencies } = setup();
    const output = await resolveItem({ description: "bicicleta" }, dependencies, signal);
    assert.equal(output.kind, "none");
  });

  it("answers none when no fitting product is available in the Branch", async () => {
    const { search } = searchOf(catalog);
    const { store } = storeOf(catalog, ["10", "20", "30"]);
    const { dependencies } = setup({ search, store });
    const output = await resolveItem({ description: "leche" }, dependencies, signal);
    assert.equal(output.kind, "none");
    if (output.kind === "none") assert.match(output.note, /^No conseguí "leche"/);
  });

  it("refuses without a postal code and touches nothing", async () => {
    const { dependencies, searched, simulated, current } = setup({ loadProfile: () => null });
    const output = await resolveItem({ description: "leche" }, dependencies, signal);
    assert.equal(output.kind, "refused");
    if (output.kind === "refused") assert.equal(output.reason, "no-postal-code");
    assert.deepEqual(searched, []);
    assert.deepEqual(simulated, []);
    assert.deepEqual(current(), []);
  });

  it("refuses a size or a quantity it cannot read", async () => {
    const { dependencies, searched, current } = setup();
    const output = await resolveItem(
      { description: "leche", quantity: "unas cuantas" },
      dependencies,
      signal,
    );
    assert.equal(output.kind, "refused");
    if (output.kind === "refused") assert.equal(output.reason, "invalid-size-or-quantity");
    assert.deepEqual(searched, []);
    assert.deepEqual(current(), []);
  });

  it("opens an Order on the first Item and numbers the refs in it", async () => {
    const { dependencies, current } = setup();
    const first = await resolveItem({ description: "leche" }, dependencies, signal);
    const second = await resolveItem({ description: "yogur" }, dependencies, signal);
    assert.equal(first.kind === "picked" && first.ref, "1");
    assert.equal(second.kind === "picked" && second.ref, "2");
    const [order, ...others] = current();
    assert.deepEqual(others, []);
    assert.equal(order?.id, "order-1");
    assert.equal(order?.status, "draft");
    assert.equal(order?.openedAt, "2026-10-16T12:00:00.000Z");
    assert.deepEqual(
      order?.items.map((item) => [item.ref, item.kind]),
      [
        ["1", "picked"],
        ["2", "picked"],
      ],
    );
  });

  it("keeps every Item when several are resolved at once", async () => {
    const { dependencies, current } = setup();
    await Promise.all([
      resolveItem({ description: "leche" }, dependencies, signal),
      resolveItem({ description: "yogur" }, dependencies, signal),
      resolveItem({ description: "bicicleta" }, dependencies, signal),
    ]);
    assert.equal(current()[0]?.items.length, 3);
    assert.deepEqual(
      current()[0]
        ?.items.map((item) => item.ref)
        .sort(),
      ["1", "2", "3"],
    );
  });

  it("starts a new Order when the last one is closed, and reopens the draft after a proposal", async () => {
    const closed: ChatOrder = {
      id: "order-1",
      status: "closed",
      openedAt: "2026-10-10T12:00:00.000Z",
      items: [],
      proposals: 1,
      proposal: null,
    };
    const { dependencies, current } = setup({}, [closed]);
    await resolveItem({ description: "leche" }, dependencies, signal);
    assert.deepEqual(
      current().map((order) => [order.id, order.status]),
      [
        ["order-1", "closed"],
        ["order-2", "draft"],
      ],
    );
    const proposed = structuredClone(current());
    proposed[1]!.status = "proposed";
    const again = setup({}, proposed);
    await resolveItem({ description: "yogur" }, again.dependencies, signal);
    assert.equal(again.current()[1]?.status, "draft");
    assert.equal(again.current()[1]?.items.at(-1)?.ref, "2");
  });

  it("picks the product by weight for a packaged product asked by grams", async () => {
    const { dependencies } = setup();
    const output = await resolveItem(
      { description: "yogur", quantity: "380 g" },
      dependencies,
      signal,
    );
    assert.equal(output.kind === "picked" && output.quantity, 2);
  });
});

const yogurts = [
  product("11", "Yogur frutilla Ilolay", 500),
  product("12", "Yogur vainilla Ilolay", 520),
  product("13", "Yogur durazno Ilolay", 540),
  product("14", "Yogur natural Ilolay", 560),
  product("15", "Yogur de coco Ilolay", 580),
  product("16", "Yogur de banana Ilolay", 600),
  product("17", "Yogur de limón Ilolay", 620),
];

function setupNothingFits(orders: ChatOrder[] = [], closest: number[] = []) {
  const { search } = searchOf(yogurts);
  const { store, simulated } = storeOf(yogurts);
  const memory = memoryOrders(orders);
  const dependencies: ResolveItemDependencies = {
    search,
    llm: llmFitting(() => ({ fits: [], closest, question: "¿Cuál?" })),
    store,
    orders: memory.orders,
    loadProfile: () => ({ postalCode: "1425" }),
    now,
  };
  return { dependencies, simulated, current: memory.current };
}

const choose = (output: Awaited<ReturnType<typeof resolveItem>>) => {
  assert.equal(output.kind, "choose");
  return output.kind === "choose" ? output : { ref: "", alternatives: [] };
};

describe("resolveItem when nothing fits", () => {
  it("returns 3 Alternatives, the closest first, and keeps them in the Order", async () => {
    const { dependencies, simulated, current } = setupNothingFits([], [3, 1]);
    const output = choose(await resolveItem({ description: "yogur" }, dependencies, signal));
    assert.equal(output.ref, "1");
    assert.deepEqual(
      output.alternatives.map((each) => each.productId),
      ["13", "11", "12"],
    );
    assert.deepEqual(simulated, []);
    const [entry] = current()[0]?.items ?? [];
    assert.equal(entry?.kind, "choose");
    if (entry?.kind === "choose") {
      assert.deepEqual(entry.shown, ["13", "11", "12"]);
      assert.equal(entry.description, "yogur");
    }
  });

  it("returns the next 3 and never an excluded product when asked for more options", async () => {
    const { dependencies, current } = setupNothingFits();
    const first = choose(await resolveItem({ description: "yogur" }, dependencies, signal));
    const shown = first.alternatives.map((each) => each.productId);
    const second = choose(
      await resolveItem({ description: "yogur", excludeProductIds: shown }, dependencies, signal),
    );
    assert.deepEqual(
      second.alternatives.map((each) => each.productId),
      ["14", "15", "16"],
    );
    for (const each of second.alternatives) assert.ok(!shown.includes(each.productId));
    assert.equal(second.ref, first.ref);
    assert.equal(current()[0]?.items.length, 1);
    const third = choose(
      await resolveItem(
        { description: "yogur", excludeProductIds: [...shown, "14", "15", "16"] },
        dependencies,
        signal,
      ),
    );
    assert.deepEqual(
      third.alternatives.map((each) => each.productId),
      ["17"],
    );
  });

  it("never repeats a product shown before even when the agent forgets to exclude it", async () => {
    const { dependencies } = setupNothingFits();
    const first = choose(await resolveItem({ description: "yogur" }, dependencies, signal));
    const second = choose(
      await resolveItem({ description: "yogur", excludeProductIds: ["99"] }, dependencies, signal),
    );
    const shown = first.alternatives.map((each) => each.productId);
    for (const each of second.alternatives) assert.ok(!shown.includes(each.productId));
  });

  it("answers none once every product was shown", async () => {
    const { dependencies } = setupNothingFits();
    const output = await resolveItem(
      {
        description: "yogur",
        excludeProductIds: yogurts.map((each) => each.productId),
      },
      dependencies,
      signal,
    );
    assert.deepEqual(output, { kind: "none", ref: "1", note: 'No encontré "yogur".' });
  });

  it("picks when a product fits among the ones not excluded", async () => {
    const { dependencies } = setupNothingFits();
    const { search } = searchOf(yogurts);
    const output = await resolveItem(
      { description: "yogur", excludeProductIds: ["11", "12", "13", "14", "15", "16"] },
      { ...dependencies, search, llm: llmFitting() },
      signal,
    );
    assert.equal(output.kind, "picked");
    if (output.kind === "picked") assert.equal(output.product.productId, "17");
  });

  it("opens an Order and moves a proposed one back to draft", async () => {
    const proposed: ChatOrder = {
      id: "order-1",
      status: "proposed",
      openedAt: "2026-10-16T12:00:00.000Z",
      items: [],
      proposals: 1,
      proposal: null,
    };
    const { dependencies, current } = setupNothingFits([proposed]);
    await resolveItem({ description: "yogur" }, dependencies, signal);
    assert.equal(current()[0]?.status, "draft");
  });
});
