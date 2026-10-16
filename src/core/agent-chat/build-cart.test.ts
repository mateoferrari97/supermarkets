import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { catalog, llmFitting, memoryOrders, searchOf, storeOf } from "./agent-chat-fixtures.ts";
import { buildCart, type BuildCartDependencies } from "./build-cart.ts";
import type { ChatMessage } from "./chat.ts";
import type { ChatOrder, OrderLine, Proposal } from "./order.ts";
import { resolveItem } from "./resolve-item.ts";
import type { TurnOutcome } from "./tool.ts";

const signal = new AbortController().signal;
const at = "2026-10-16T12:00:00.000Z";

const line = (productId: string, name: string, quantity: number, total: number): OrderLine => ({
  description: name,
  productId,
  itemId: `${productId}0`,
  name,
  brand: null,
  quantity,
  unitPrice: total / quantity,
  total,
  reason: "Es el más barato.",
  notes: [],
});

const proposal = (id = "order-1-1"): Proposal => ({
  id,
  lines: [
    line("2", "Leche entera Sancor 1 l", 2, 1600),
    line("4", "Yogur firme Ilolay 190 g", 1, 500),
  ],
  notes: ['No encontré "bicicleta".'],
  total: 2100,
});

const proposed = (overrides: Partial<ChatOrder> = {}): ChatOrder => ({
  id: "order-1",
  status: "proposed",
  openedAt: at,
  items: [],
  proposals: 1,
  proposal: proposal(),
  ...overrides,
});

const proposalMessage = (id = "order-1-1"): ChatMessage => ({
  role: "assistant",
  at,
  text: "Armé este pedido",
  parts: [{ type: "proposal", proposal: proposal(id) }],
});

const owner = (text: string): ChatMessage => ({ role: "owner", at, text });

const answered: ChatMessage[] = [owner("leche"), proposalMessage(), owner("Confirmar")];

function setup(
  orders: ChatOrder[] = [proposed()],
  messages: ChatMessage[] = answered,
  unavailable: string[] = [],
  overrides: Partial<BuildCartDependencies> = {},
) {
  const { store, simulated } = storeOf(catalog, unavailable);
  const memory = memoryOrders(orders);
  const outcome: TurnOutcome = { ended: null };
  const dependencies: BuildCartDependencies = {
    store,
    orders: memory.orders,
    loadProfile: () => ({ postalCode: "1425" }),
    outcome,
    messages,
    ...overrides,
  };
  return { dependencies, outcome, simulated, current: memory.current };
}

describe("buildCart", () => {
  it("builds the cart of the latest proposal once the Owner answered it and closes the Order", async () => {
    const { dependencies, outcome, simulated, current } = setup();
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, {
      kind: "built",
      cartLink: "https://example.test/cart",
      total: 2100,
    });
    assert.deepEqual(simulated, [
      {
        postalCode: "1425",
        items: [
          { itemId: "20", quantity: 2 },
          { itemId: "40", quantity: 1 },
        ],
      },
    ]);
    const [order] = current();
    assert.equal(order?.status, "closed");
    assert.equal(order?.cart?.cartLink, "https://example.test/cart");
    assert.equal(order?.cart?.postalCode, "1425");
    assert.deepEqual(
      order?.cart?.lines.map((each) => [each.productId, each.quantity, each.total]),
      [
        ["2", 2, 1600],
        ["4", 1, 500],
      ],
    );
    assert.deepEqual(order?.cart?.notes, ['No encontré "bicicleta".']);
    assert.equal(outcome.ended?.parts[0]?.type, "cart");
    assert.match(outcome.ended?.text ?? "", /https:\/\/example\.test\/cart/);
    assert.match(outcome.ended?.text ?? "", /Total: \$2100\.00/);
  });

  it("refuses a proposal no Owner message has followed", async () => {
    const { dependencies, outcome, simulated, current } = setup(undefined, [
      owner("leche"),
      proposalMessage(),
    ]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "unanswered" });
    assert.deepEqual(simulated, []);
    assert.equal(current()[0]?.status, "proposed");
    assert.equal(outcome.ended, null);
  });

  it("does not count an Owner message that came before the proposal", async () => {
    const { dependencies } = setup(undefined, [owner("Confirmar"), proposalMessage()]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "unanswered" });
  });

  it("refuses a proposal that was never shown in the Chat", async () => {
    const { dependencies } = setup(undefined, [owner("hola"), owner("Confirmar")]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "unanswered" });
  });

  it("refuses a proposal that is not the latest one", async () => {
    const { dependencies, simulated, current } = setup([
      proposed({ proposals: 2, proposal: proposal("order-1-2") }),
    ]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "stale-proposal" });
    assert.deepEqual(simulated, []);
    assert.equal(current()[0]?.status, "proposed");
  });

  it("refuses the latest proposal once an Item changed after it", async () => {
    const { dependencies, simulated } = setup([proposed({ status: "draft" })]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "stale-proposal" });
    assert.deepEqual(simulated, []);
  });

  it("refuses when there is no proposal, no open Order or no postal code", async () => {
    const none = setup([proposed({ status: "draft", proposals: 0, proposal: null })]);
    assert.deepEqual(await buildCart({ proposalId: "order-1-1" }, none.dependencies, signal), {
      kind: "refused",
      reason: "no-proposal",
    });
    const closed = setup([proposed({ status: "closed" })]);
    assert.deepEqual(await buildCart({ proposalId: "order-1-1" }, closed.dependencies, signal), {
      kind: "refused",
      reason: "no-open-order",
    });
    const unknown = setup(undefined, undefined, [], { loadProfile: () => null });
    assert.deepEqual(await buildCart({ proposalId: "order-1-1" }, unknown.dependencies, signal), {
      kind: "refused",
      reason: "no-postal-code",
    });
  });

  it("refuses the same proposal again once the Order is closed", async () => {
    const { dependencies, current } = setup();
    await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    const again = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(again, { kind: "refused", reason: "no-open-order" });
    assert.equal(current().length, 1);
  });

  it("drops a product that ran out, says so and prices the rest of the cart", async () => {
    const { dependencies, simulated, current, outcome } = setup(undefined, undefined, ["40"]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, {
      kind: "built",
      cartLink: "https://example.test/cart",
      total: 1600,
    });
    assert.equal(simulated.length, 2);
    assert.deepEqual(simulated[1]?.items, [{ itemId: "20", quantity: 2 }]);
    const cart = current()[0]?.cart;
    assert.deepEqual(
      cart?.lines.map((each) => each.productId),
      ["2"],
    );
    assert.deepEqual(cart?.notes, [
      'No encontré "bicicleta".',
      '"Yogur firme Ilolay 190 g" no estaba disponible al armar el carrito',
    ]);
    assert.equal(outcome.ended?.parts[0]?.type, "cart");
  });

  it("refuses and keeps the Order proposed when nothing in it is available", async () => {
    const { dependencies, current, outcome } = setup(undefined, undefined, ["20", "40"]);
    const output = await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    assert.deepEqual(output, { kind: "refused", reason: "nothing-available" });
    assert.equal(current()[0]?.status, "proposed");
    assert.equal(current()[0]?.cart, undefined);
    assert.equal(outcome.ended, null);
  });

  it("lets the next request to buy something open a new Order", async () => {
    const { dependencies, current } = setup();
    await buildCart({ proposalId: "order-1-1" }, dependencies, signal);
    const { search } = searchOf(catalog);
    const output = await resolveItem(
      { description: "leche" },
      {
        search,
        llm: llmFitting(),
        store: dependencies.store,
        orders: dependencies.orders,
        loadProfile: dependencies.loadProfile,
        now: () => new Date(at),
      },
      signal,
    );
    assert.equal(output.kind, "picked");
    assert.deepEqual(
      current().map((order) => [order.id, order.status]),
      [
        ["order-1", "closed"],
        ["order-2", "draft"],
      ],
    );
  });
});
