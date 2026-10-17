import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  AGENT_STORIES,
  AGENT_TOOL_NAMES,
  agentEvalSetIds,
  staleIds,
  validateAgentEvalSet,
  type AgentCase,
} from "./eval-set.ts";
import { agentTools } from "./tools.ts";
import { catalog, llmFitting, memoryOrders, searchOf, storeOf } from "./agent-chat-fixtures.ts";

const evalCase = (overrides: Partial<AgentCase> = {}): AgentCase => ({
  id: "a-case",
  covers: [...AGENT_STORIES],
  setup: { postalCode: "1425" },
  turns: [{ owner: "hola", ends: "text" }],
  ...overrides,
});

const errorsOf = (...cases: AgentCase[]) => validateAgentEvalSet({ cases });

describe("validateAgentEvalSet", () => {
  it("accepts a case that covers every story", () => {
    assert.deepEqual(errorsOf(evalCase()), []);
  });

  it("names the stories no case covers", () => {
    assert.deepEqual(errorsOf(evalCase({ covers: ["off-topic"] })), [
      ...AGENT_STORIES.filter((story) => story !== "off-topic").map(
        (story) => `no case covers ${story}`,
      ),
    ]);
  });

  it("rejects a shape the schema does not know", () => {
    const [error] = validateAgentEvalSet({ cases: [{ ...evalCase(), extra: true }] });
    assert.match(error!, /^agent eval set cases\.0: /);
  });

  it("rejects an id used twice", () => {
    assert.ok(errorsOf(evalCase(), evalCase()).includes('case "a-case" id is used more than once'));
  });

  it("rejects a tool that is required and forbidden in the same turn", () => {
    const turns: AgentCase["turns"] = [
      { owner: "hola", ends: "text", calls: ["buildCart"], noCalls: ["buildCart"] },
    ];
    assert.ok(
      errorsOf(evalCase({ turns })).includes('case "a-case" turn 1 requires and forbids buildCart'),
    );
  });

  it("rejects questions in a turn that does not end with a round", () => {
    const turns: AgentCase["turns"] = [{ owner: "hola", ends: "text", minQuestions: 2 }];
    assert.ok(
      errorsOf(evalCase({ turns })).includes(
        'case "a-case" turn 1 expects questions but does not end with a round',
      ),
    );
  });

  it("rejects a cart expectation without a last turn that ends with a cart", () => {
    const cart = { minLines: 1 };
    assert.ok(
      errorsOf(evalCase({ cart })).includes(
        'case "a-case" expects a cart but its last turn does not end with one',
      ),
    );
  });

  it("rejects no cart when a turn ends with one", () => {
    const turns: AgentCase["turns"] = [{ owner: "dale", ends: "cart" }];
    assert.ok(
      errorsOf(evalCase({ turns, cart: null })).includes(
        'case "a-case" expects no cart but a turn ends with one',
      ),
    );
  });

  it("rejects a cart expectation that scores nothing", () => {
    const turns: AgentCase["turns"] = [{ owner: "dale", ends: "cart" }];
    assert.ok(
      errorsOf(evalCase({ turns, cart: {} })).includes(
        'case "a-case" scores a cart with neither lines nor minLines',
      ),
    );
  });

  it("rejects an expected postal code no turn can save", () => {
    assert.ok(
      errorsOf(evalCase({ postalCode: "5000" })).includes(
        'case "a-case" expects a postal code but no turn calls updateProfile',
      ),
    );
  });

  it("rejects past Orders without a postal code", () => {
    const setup: AgentCase["setup"] = {
      postalCode: null,
      pastOrders: [{ lines: [{ productId: "1", quantity: 1 }] }],
    };
    assert.ok(
      errorsOf(evalCase({ setup })).includes('case "a-case" has past Orders but no postal code'),
    );
  });
});

describe("the tool names", () => {
  it("are the tools the agent has", () => {
    const { store } = storeOf(catalog);
    const tools = agentTools({
      store,
      saveProfile: () => undefined,
      loadProfile: () => null,
      search: searchOf(catalog).search,
      llm: llmFitting(),
      orders: memoryOrders().orders,
      now: () => new Date(),
    })({ ended: null });
    assert.deepEqual(Object.keys(tools).sort(), [...AGENT_TOOL_NAMES].sort());
  });
});

describe("stale ids", () => {
  const cases = [
    evalCase({
      id: "bought",
      setup: { postalCode: "1425", pastOrders: [{ lines: [{ productId: "1", quantity: 1 }] }] },
      turns: [{ owner: "dale", ends: "cart" }],
      cart: { lines: [{ product: "Leche", fits: ["1", "2"] }] },
    }),
  ];

  it("lists the products of the past Orders and of the cart expectation once", () => {
    assert.deepEqual(agentEvalSetIds({ cases }), [{ caseId: "bought", ids: ["1", "2"] }]);
  });

  it("reports the ones missing or out of stock", () => {
    assert.deepEqual(
      staleIds(
        { cases },
        new Map([
          ["1", true],
          ["2", false],
        ]),
      ),
      [{ caseId: "bought", productId: "2", reason: "out of stock" }],
    );
    assert.deepEqual(staleIds({ cases }, new Map([["1", true]])), [
      { caseId: "bought", productId: "2", reason: "missing" },
    ]);
  });
});
