import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { AgentTurn, ChatAgent } from "./agent.ts";
import { catalog, llmFitting, product, searchOf } from "./agent-chat-fixtures.ts";
import { endOf, pastOrderOf, recording, runAgentCase, type RecordedCall } from "./eval-run.ts";
import type { AgentCase } from "./eval-set.ts";
import type { AgentTools } from "./tool.ts";

const scripted = (...steps: ((turn: AgentTurn) => Promise<string>)[]): ChatAgent => {
  let next = 0;
  return { reply: (turn) => steps[next++]!(turn) };
};

const run = (evalCase: AgentCase, agent: ChatAgent) =>
  runAgentCase(evalCase, {
    agent,
    products: catalog,
    search: searchOf(catalog).search,
    llm: llmFitting(),
  });

const caseOf = (overrides: Partial<AgentCase> = {}): AgentCase => ({
  id: "a-case",
  covers: ["precise-product"],
  setup: { postalCode: "1425" },
  turns: [
    { owner: "2 leches", ends: "proposal" },
    { owner: "dale", ends: "cart" },
  ],
  ...overrides,
});

describe("runAgentCase", () => {
  it("runs the turns over one Chat, records the tool calls and keeps the carts", async () => {
    const agent = scripted(
      async ({ tools }) => {
        await tools.resolveItem!.execute({ description: "leche", quantity: "2 unit" }, signal);
        await tools.proposeOrder!.execute({ refs: ["1"] }, signal);
        return "";
      },
      async ({ tools, messages, order }) => {
        assert.deepEqual(
          messages.map(({ role, text }) => [role, text.split("\n")[0]]),
          [
            ["owner", "2 leches"],
            ["assistant", "Armé este pedido:"],
            ["owner", "dale"],
          ],
        );
        await tools.buildCart!.execute({ proposalId: order!.proposal!.id }, signal);
        return "";
      },
    );
    const result = await run(caseOf(), agent);
    assert.deepEqual(
      result.turns.map(({ ends, calls }) => [ends, calls.map(({ name }) => name)]),
      [
        ["proposal", ["resolveItem", "proposeOrder"]],
        ["cart", ["buildCart"]],
      ],
    );
    assert.equal(result.carts.length, 1);
    assert.deepEqual(
      result.carts[0]!.lines.map(({ productId, quantity }) => [productId, quantity]),
      [["2", 2]],
    );
    assert.equal(result.carts[0]!.cartLink, "https://eval.invalid/cart?20x2");
  });

  it("starts from the Profile, the chat and the past Orders of the setup", async () => {
    const seen: AgentTurn[] = [];
    const agent: ChatAgent = {
      reply: (turn) => {
        seen.push(turn);
        return Promise.resolve("ok");
      },
    };
    await run(
      caseOf({
        setup: {
          postalCode: "1425",
          chat: [
            { role: "owner", text: "hola" },
            { role: "assistant", text: "hola, ¿qué necesitás?" },
          ],
          pastOrders: [{ lines: [{ productId: "4", quantity: 3 }] }],
        },
        turns: [{ owner: "lo mismo", ends: "text" }],
      }),
      agent,
    );
    const [turn] = seen;
    assert.deepEqual(turn!.profile, { postalCode: "1425" });
    assert.deepEqual(
      turn!.messages.map(({ text }) => text),
      ["hola", "hola, ¿qué necesitás?", "lo mismo"],
    );
    assert.equal(turn!.order, null);
    assert.deepEqual(
      turn!.pastOrders.map(({ id, status, cart }) => [id, status, cart!.lines[0]!.productId]),
      [["order-1", "closed", "4"]],
    );
  });

  it("starts with no Profile when the setup has no postal code, and keeps what updateProfile saves", async () => {
    const agent = scripted(async ({ tools, profile }) => {
      assert.equal(profile, null);
      await tools.updateProfile!.execute({ postalCode: "5000" }, signal);
      return "Listo";
    });
    const result = await run(
      caseOf({ setup: { postalCode: null }, turns: [{ owner: "5000", ends: "text" }] }),
      agent,
    );
    assert.deepEqual(result.profile, { postalCode: "5000" });
    assert.equal(result.turns[0]!.profileBefore, null);
  });

  it("sends a postal code the Branch does not deliver to as refused", async () => {
    const agent = scripted(async ({ tools }) => {
      await tools.updateProfile!.execute({ postalCode: "9999" }, signal);
      return "No llegamos";
    });
    const result = await run(
      caseOf({
        setup: { postalCode: "1425", doesNotDeliver: ["9999"] },
        turns: [{ owner: "9999", ends: "text" }],
      }),
      agent,
    );
    assert.deepEqual(result.profile, { postalCode: "1425" });
    assert.deepEqual(result.turns[0]!.calls[0]!.output, {
      kind: "refused",
      postalCode: "9999",
      reason: "not-delivered",
    });
  });
});

const signal = new AbortController().signal;

describe("recording", () => {
  const tools: AgentTools = {
    good: {
      description: "",
      inputSchema: undefined as never,
      endsTurn: false,
      execute: (input) => Promise.resolve({ echoed: input }),
    },
    bad: {
      description: "",
      inputSchema: undefined as never,
      endsTurn: false,
      execute: () => Promise.reject(new Error("boom")),
    },
  };

  it("records the input and output of a call, and the error of a call that throws", async () => {
    const calls: RecordedCall[] = [];
    const wrapped = recording(() => tools, calls)({ ended: null });
    await wrapped.good!.execute({ a: 1 }, signal);
    await assert.rejects(wrapped.bad!.execute({}, signal), /boom/);
    assert.deepEqual(calls, [
      { name: "good", input: { a: 1 }, output: { echoed: { a: 1 } }, error: null },
      { name: "bad", input: {}, output: null, error: "boom" },
    ]);
  });
});

describe("endOf", () => {
  const message = (parts: { type: "cart" | "round" | "proposal" }[]) =>
    ({ role: "assistant", at: "2026-10-16T12:00:00.000Z", text: "x", parts }) as never;

  it("is the part that ends the turn, or text", () => {
    assert.equal(endOf(message([])), "text");
    assert.equal(endOf(message([{ type: "proposal" }])), "proposal");
    assert.equal(endOf(message([{ type: "round" }])), "round");
    assert.equal(endOf(message([{ type: "cart" }])), "cart");
  });
});

describe("pastOrderOf", () => {
  const at = new Date("2026-10-16T12:00:00.000Z");

  it("builds a closed Order bought at the snapshot price", () => {
    const order = pastOrderOf(
      1,
      [{ productId: "1", quantity: 2 }],
      [product("1", "Leche", 1000)],
      "1425",
      at,
    );
    assert.equal(order.id, "order-2");
    assert.equal(order.status, "closed");
    assert.deepEqual(
      order.cart!.lines.map(({ productId, itemId, quantity, total }) => [
        productId,
        itemId,
        quantity,
        total,
      ]),
      [["1", "10", 2, 2000]],
    );
    assert.equal(order.cart!.total, 2000);
  });

  it("fails for a product that is not in the snapshot", () => {
    assert.throws(
      () => pastOrderOf(0, [{ productId: "404", quantity: 1 }], catalog, "1425", at),
      /Past Order product 404 is not in the Catalog Snapshot/,
    );
  });
});
