import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatMessage } from "./chat.ts";
import { memoryOrders, product, storeOf } from "./agent-chat-fixtures.ts";
import { chooseAlternative, type ChooseAlternativeDependencies } from "./choose-alternative.ts";
import type { ChatOrder } from "./order.ts";

const signal = new AbortController().signal;

const alternatives = [
  product("11", "Yogur frutilla Ilolay", 500),
  product("12", "Yogur vainilla Ilolay", 520),
];

const waiting = (status: ChatOrder["status"] = "proposed"): ChatOrder => ({
  id: "order-1",
  status,
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [
    {
      kind: "choose",
      ref: "1",
      description: "yogur",
      brand: null,
      size: "common",
      quantity: "2 unit",
      alternatives,
      shown: ["11", "12"],
    },
  ],
  proposals: 1,
  proposal: null,
});

const roundMessage = (recommended: number, ref = "1"): ChatMessage => ({
  role: "assistant",
  at: "2026-10-16T12:00:00.000Z",
  text: "Necesito que me confirmes algunas cosas",
  parts: [
    {
      type: "round",
      round: {
        questions: [
          {
            number: 1,
            ref,
            text: "¿Cuál?",
            options: alternatives.map((each) => ({
              label: each.name,
              productId: each.productId,
              price: each.price,
            })),
            recommended,
          },
        ],
      },
    },
  ],
});

function setup(
  orders: ChatOrder[],
  unavailable: string[] = [],
  postalCode: string | null = "1425",
  messages: ChatMessage[] = [],
) {
  const { store, simulated } = storeOf(alternatives, unavailable);
  const memory = memoryOrders(orders);
  const dependencies: ChooseAlternativeDependencies = {
    store,
    orders: memory.orders,
    loadProfile: () => (postalCode === null ? null : { postalCode }),
    messages,
  };
  return { dependencies, simulated, current: memory.current };
}

describe("chooseAlternative", () => {
  it("prices the chosen option at the Item's quantity and replaces the Item under the same ref", async () => {
    const { dependencies, current } = setup([waiting()]);
    const output = await chooseAlternative({ ref: "1", productId: "12" }, dependencies, signal);
    assert.equal(output.kind, "picked");
    if (output.kind === "picked") {
      assert.equal(output.ref, "1");
      assert.equal(output.product.productId, "12");
      assert.equal(output.quantity, 2);
      assert.equal(output.total, 1040);
    }
    const [order] = current();
    assert.equal(order?.status, "draft");
    const [entry] = order?.items ?? [];
    assert.equal(entry?.kind, "picked");
    if (entry?.kind === "picked") {
      assert.equal(entry.ref, "1");
      assert.equal(entry.line.description, "yogur");
      assert.equal(entry.line.productId, "12");
    }
  });

  it("refuses a product that was not offered and changes nothing", async () => {
    const { dependencies, simulated, current } = setup([waiting()]);
    const output = await chooseAlternative({ ref: "1", productId: "99" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "not-an-alternative" });
    assert.deepEqual(simulated, []);
    assert.deepEqual(current(), [waiting()]);
  });

  it("refuses an unknown ref, an Item that is not waiting, no open Order and no postal code", async () => {
    const picked: ChatOrder = {
      ...waiting(),
      items: [
        {
          kind: "none",
          ref: "1",
          description: "yogur",
          note: 'No encontré "yogur".',
        },
      ],
    };
    const ask = (orders: ChatOrder[], ref = "1", postalCode: string | null = "1425") =>
      chooseAlternative(
        { ref, productId: "11" },
        setup(orders, [], postalCode).dependencies,
        signal,
      );
    assert.deepEqual(await ask([waiting()], "7"), { kind: "refused", reason: "unknown-ref" });
    assert.deepEqual(await ask([picked]), { kind: "refused", reason: "unknown-ref" });
    assert.deepEqual(await ask([waiting("closed")]), { kind: "refused", reason: "no-open-order" });
    assert.deepEqual(await ask([waiting()], "1", null), {
      kind: "refused",
      reason: "no-postal-code",
    });
  });

  it("leaves the Item waiting when the Branch cannot sell the chosen option", async () => {
    const { dependencies, current } = setup([waiting()], ["110"]);
    const output = await chooseAlternative({ ref: "1", productId: "11" }, dependencies, signal);
    assert.equal(output.kind, "unavailable");
    assert.deepEqual(current(), [waiting()]);
  });

  it("takes the option the last round recommended for the ref when asked to", async () => {
    const { dependencies } = setup([waiting()], [], "1425", [roundMessage(1), roundMessage(2)]);
    const output = await chooseAlternative({ ref: "1", recommended: true }, dependencies, signal);
    assert.equal(output.kind, "picked");
    if (output.kind === "picked") assert.equal(output.product.productId, "12");
  });

  it("refuses to take a recommended option when no round has one for the ref", async () => {
    const { dependencies, current } = setup([waiting()], [], "1425", [roundMessage(1, "2")]);
    const output = await chooseAlternative({ ref: "1", recommended: true }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "no-recommended-product" });
    assert.deepEqual(current(), [waiting()]);
  });
});
