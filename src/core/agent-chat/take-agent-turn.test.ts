import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { AgentTurn, ChatAgent } from "./agent.ts";
import { CONTEXT_MESSAGES, chatMessageSchema, type ChatMessage } from "./chat.ts";
import type { Profile } from "./profile.ts";
import type { ChatOrder, Proposal } from "./order.ts";
import type { AgentTools, ToolsForTurn, TurnOutcome } from "./tool.ts";
import { takeAgentTurn } from "./take-agent-turn.ts";
import type { TurnLogEntry } from "./turn-log.ts";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 12, minute)).toISOString();

const message = (index: number): ChatMessage => ({
  role: index % 2 === 0 ? "owner" : "assistant",
  at: at(index % 60),
  text: `message ${index}`,
});

const noTools: AgentTools = {};
const toolsOf: ToolsForTurn = () => noTools;

function fakeAgent(answer = "Hola, ¿qué necesitás?") {
  const seen: ChatMessage[][] = [];
  const turns: AgentTurn[] = [];
  const agent: ChatAgent = {
    reply: (turn) => {
      turns.push(turn);
      seen.push(turn.messages);
      return Promise.resolve(answer);
    },
  };
  return { agent, seen, turns };
}

function fakeClock(startAt = 1000) {
  let time = startAt;
  return {
    clock: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

type TurnLogOptions = {
  clock?: () => number;
  saveTurnLog?: (entry: TurnLogEntry) => void;
  signal?: AbortSignal;
};

const turn = (
  history: ChatMessage[],
  text: string,
  agent: ChatAgent,
  saved: ChatMessage[] = [],
  profile: Profile | null = null,
  tools: ToolsForTurn = toolsOf,
  order: ChatOrder | null = null,
  orders: ChatOrder[] = [],
  {
    clock = fakeClock().clock,
    saveTurnLog = () => undefined,
    signal = new AbortController().signal,
  }: TurnLogOptions = {},
) =>
  takeAgentTurn(history, text, {
    agent,
    profile,
    order,
    orders,
    tools,
    save: (saved_) => saved.push(saved_),
    now: () => new Date(at(30)),
    clock,
    saveTurnLog,
    signal,
  });

const plainTool = (run: () => Promise<unknown>, endsTurn = false): AgentTools[string] => ({
  description: "a tool",
  inputSchema: chatMessageSchema.pick({ role: true }).partial(),
  endsTurn,
  execute: run,
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((resolve_) => {
    resolve = resolve_;
  });
  return { promise, resolve };
}

const noSignal = new AbortController().signal;

describe("takeAgentTurn", () => {
  it("saves the Owner message, asks the agent and saves its reply", async () => {
    const { agent, seen } = fakeAgent();
    const saved: ChatMessage[] = [];
    const reply = await turn([], "hola", agent, saved);
    assert.deepEqual(saved, [
      { role: "owner", at: at(30), text: "hola" },
      { role: "assistant", at: at(30), text: "Hola, ¿qué necesitás?" },
    ]);
    assert.deepEqual(reply, saved[1]);
    assert.deepEqual(seen, [[saved[0]]]);
  });

  it("gives the agent only the last 40 messages, the new one included", async () => {
    const { agent, seen } = fakeAgent();
    const history = Array.from({ length: 100 }, (_, index) => message(index));
    await turn(history, "agregá yogur", agent);
    const [sent] = seen;
    assert.equal(sent?.length, CONTEXT_MESSAGES);
    assert.equal(sent?.[0]?.text, "message 61");
    assert.equal(sent?.at(-1)?.text, "agregá yogur");
  });

  it("gives the agent the Profile and the tools of the turn", async () => {
    const { agent, turns } = fakeAgent();
    await turn([], "hola", agent, [], { postalCode: "1425" });
    assert.deepEqual(turns[0]?.profile, { postalCode: "1425" });
    assert.deepEqual(turns[0]?.tools, noTools);
  });

  it("gives the agent the open Order", async () => {
    const { agent, turns } = fakeAgent();
    const open: ChatOrder = {
      id: "order-1",
      status: "draft",
      openedAt: at(1),
      items: [],
      proposals: 0,
      proposal: null,
    };
    await turn([], "hola", agent, [], null, toolsOf, open);
    assert.equal(turns[0]?.order, open);
  });

  it("saves the card of a tool that ended the turn instead of the agent's text", async () => {
    const proposal: Proposal = {
      id: "order-1-1",
      lines: [
        {
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
        },
      ],
      notes: [],
      total: 800,
    };
    const ending: ChatAgent = {
      reply: (turn_) => {
        turn_.tools.propose?.execute({}, new AbortController().signal).catch(() => undefined);
        return Promise.resolve("");
      },
    };
    const saved: ChatMessage[] = [];
    const tools: ToolsForTurn = (outcome: TurnOutcome) => ({
      propose: {
        description: "ends",
        inputSchema: chatMessageSchema.pick({ role: true }).partial(),
        endsTurn: true,
        execute: () => {
          outcome.ended = { text: "Armé este pedido", parts: [{ type: "proposal", proposal }] };
          return Promise.resolve({});
        },
      },
    });
    const reply = await turn([], "leche", ending, saved, null, tools);
    assert.deepEqual(reply, {
      role: "assistant",
      at: at(30),
      text: "Armé este pedido",
      parts: [{ type: "proposal", proposal }],
    });
    assert.deepEqual(saved.at(-1), reply);
  });

  it("gives the agent the last 3 closed Orders and nothing older", async () => {
    const { agent, turns } = fakeAgent();
    const orders: ChatOrder[] = ["1", "2", "3", "4"].map((number) => ({
      id: `order-${number}`,
      status: "closed",
      openedAt: at(1),
      items: [],
      proposals: 1,
      proposal: null,
    }));
    orders.push({ ...orders[0]!, id: "order-5", status: "draft" });
    await turn([], "lo mismo que la última vez", agent, [], null, toolsOf, orders[4], orders);
    assert.deepEqual(
      turns[0]?.pastOrders.map((each) => each.id),
      ["order-2", "order-3", "order-4"],
    );
  });

  it("keeps the Owner message saved when the agent fails", async () => {
    const saved: ChatMessage[] = [];
    const failing: ChatAgent = { reply: () => Promise.reject(new Error("session failed")) };
    await assert.rejects(turn([], "hola", failing, saved), /session failed/);
    assert.deepEqual(
      saved.map((saved_) => saved_.role),
      ["owner"],
    );
  });
});

describe("the Turn Log of a turn", () => {
  it("records a text reply with the Owner's text, the agent's span and the total time, after the reply is saved", async () => {
    const { clock, advance } = fakeClock();
    const written: string[] = [];
    const log: TurnLogEntry[] = [];
    const agent: ChatAgent = {
      reply: () => {
        advance(300);
        return Promise.resolve("Hola");
      },
    };
    const reply = await takeAgentTurn([], "hola", {
      agent,
      profile: null,
      order: null,
      tools: toolsOf,
      save: (message) => {
        written.push(message.role);
        advance(5);
      },
      now: () => new Date(at(30)),
      clock,
      saveTurnLog: (entry) => {
        written.push("turn log");
        log.push(entry);
      },
      signal: noSignal,
    });
    assert.equal(reply.text, "Hola");
    assert.deepEqual(written, ["owner", "assistant", "turn log"]);
    assert.deepEqual(log, [
      {
        startedAt: at(30),
        ownerText: "hola",
        durationMs: 310,
        outcome: "replied",
        error: null,
        agent: { startMs: 5, endMs: 305, reported: null },
        events: [],
      },
    ]);
  });

  it("records a turn a tool ended with the tool's call and no reported session", async () => {
    const { clock, advance } = fakeClock();
    const log: TurnLogEntry[] = [];
    const tools: ToolsForTurn = (outcome: TurnOutcome) => ({
      proposeOrder: plainTool(() => {
        advance(40);
        outcome.ended = { text: "Armé este pedido", parts: [] };
        return Promise.resolve({});
      }, true),
    });
    const agent: ChatAgent = {
      reply: async (turn_) => {
        advance(100);
        await turn_.tools.proposeOrder?.execute({}, noSignal);
        advance(10);
        return "";
      },
    };
    const reply = await turn([], "leche", agent, [], null, tools, null, [], {
      clock,
      saveTurnLog: (entry) => log.push(entry),
    });
    assert.equal(reply.text, "Armé este pedido");
    assert.equal(log[0]?.outcome, "ended-by-tool");
    assert.equal(log[0]?.durationMs, 150);
    assert.deepEqual(log[0]?.agent, { startMs: 0, endMs: 150, reported: null });
    assert.deepEqual(log[0]?.events, [
      { kind: "tool", name: "proposeOrder", startMs: 100, endMs: 140, ok: true, error: null },
    ]);
  });

  it("records what the agent reports about its session", async () => {
    const log: TurnLogEntry[] = [];
    const report = {
      durationMs: 2500,
      costUsd: 0.0123,
      inputTokens: 30,
      outputTokens: 85,
      cacheReadTokens: 4000,
      cacheWriteTokens: null,
    };
    const agent: ChatAgent = {
      reply: (turn_) => {
        turn_.reportSession(report);
        return Promise.resolve("Hola");
      },
    };
    await turn([], "hola", agent, [], null, toolsOf, null, [], {
      saveTurnLog: (entry) => log.push(entry),
    });
    assert.deepEqual(log[0]?.agent.reported, report);
  });

  it("records the steps and LLM calls a tool reports, timed from the start of the turn", async () => {
    const { clock, advance } = fakeClock();
    const log: TurnLogEntry[] = [];
    const tools: ToolsForTurn = (_outcome, _messages, reporter) => ({
      resolveItem: plainTool(() => {
        const step = { kind: "choose-products" as const, original: "leche" };
        advance(5);
        reporter?.onStep({ status: "started", id: 1, step });
        advance(200);
        reporter?.onLlmCall({
          task: "fit-products",
          model: "claude-sonnet-5-5",
          effort: "low",
          item: "leche",
          durationMs: 180,
          costUsd: 0.01,
        });
        advance(15);
        reporter?.onStep({ status: "done", id: 1, step, durationMs: 215 });
        return Promise.resolve({});
      }),
    });
    const agent: ChatAgent = {
      reply: async (turn_) => {
        advance(100);
        await turn_.tools.resolveItem?.execute({}, noSignal);
        return "Listo";
      },
    };
    await turn([], "leche", agent, [], null, tools, null, [], {
      clock,
      saveTurnLog: (entry) => log.push(entry),
    });
    assert.deepEqual(log[0]?.events, [
      {
        kind: "llm-call",
        task: "fit-products",
        model: "claude-sonnet-5-5",
        effort: "low",
        item: "leche",
        endMs: 305,
        durationMs: 180,
        costUsd: 0.01,
      },
      { kind: "step", label: "Eligiendo productos para 'leche'", startMs: 105, endMs: 320 },
      { kind: "tool", name: "resolveItem", startMs: 100, endMs: 320, ok: true, error: null },
    ]);
  });

  it("records a tool that fails with its error and the turn still replies", async () => {
    const { clock, advance } = fakeClock();
    const log: TurnLogEntry[] = [];
    const tools: ToolsForTurn = () => ({
      resolveItem: plainTool(() => {
        advance(25);
        return Promise.reject(new Error("store down"));
      }),
    });
    const agent: ChatAgent = {
      reply: async (turn_) => {
        advance(10);
        await turn_.tools.resolveItem?.execute({}, noSignal).catch(() => undefined);
        return "No pude buscar la leche.";
      },
    };
    await turn([], "leche", agent, [], null, tools, null, [], {
      clock,
      saveTurnLog: (entry) => log.push(entry),
    });
    assert.equal(log[0]?.outcome, "replied");
    assert.deepEqual(log[0]?.events, [
      { kind: "tool", name: "resolveItem", startMs: 10, endMs: 35, ok: false, error: "store down" },
    ]);
  });

  it("records tool calls that run at the same time with overlapping times", async () => {
    const { clock, advance } = fakeClock();
    const log: TurnLogEntry[] = [];
    const milk = deferred();
    const yogurt = deferred();
    const tools: ToolsForTurn = () => ({
      resolveItem: plainTool(() => milk.promise),
      searchCatalog: plainTool(() => yogurt.promise),
    });
    const agent: ChatAgent = {
      reply: async (turn_) => {
        advance(10);
        const first = turn_.tools.resolveItem?.execute({}, noSignal);
        advance(10);
        const second = turn_.tools.searchCatalog?.execute({}, noSignal);
        advance(20);
        yogurt.resolve();
        await second;
        advance(10);
        milk.resolve();
        await first;
        return "Listo";
      },
    };
    await turn([], "leche y yogur", agent, [], null, tools, null, [], {
      clock,
      saveTurnLog: (entry) => log.push(entry),
    });
    assert.deepEqual(log[0]?.events, [
      { kind: "tool", name: "searchCatalog", startMs: 20, endMs: 40, ok: true, error: null },
      { kind: "tool", name: "resolveItem", startMs: 10, endMs: 50, ok: true, error: null },
    ]);
  });

  it("records a failed turn with its error and the calls made so far, then fails", async () => {
    const { clock, advance } = fakeClock();
    const log: TurnLogEntry[] = [];
    const tools: ToolsForTurn = () => ({
      resolveItem: plainTool(() => {
        advance(30);
        return Promise.resolve({});
      }),
    });
    const failing: ChatAgent = {
      reply: async (turn_) => {
        await turn_.tools.resolveItem?.execute({}, noSignal);
        advance(70);
        throw new Error("session failed");
      },
    };
    await assert.rejects(
      turn([], "hola", failing, [], null, tools, null, [], {
        clock,
        saveTurnLog: (entry) => log.push(entry),
      }),
      /session failed/,
    );
    assert.equal(log.length, 1);
    assert.equal(log[0]?.outcome, "failed");
    assert.equal(log[0]?.error, "session failed");
    assert.equal(log[0]?.durationMs, 100);
    assert.deepEqual(log[0]?.agent, { startMs: 0, endMs: 100, reported: null });
    assert.equal(log[0]?.events.length, 1);
  });

  it("records a turn the Owner stopped as aborted, then fails as before", async () => {
    const log: TurnLogEntry[] = [];
    const controller = new AbortController();
    const stopped: ChatAgent = {
      reply: (_turn, signal) => {
        controller.abort();
        return Promise.reject(signal.reason as Error);
      },
    };
    await assert.rejects(
      turn([], "hola", stopped, [], null, toolsOf, null, [], {
        saveTurnLog: (entry) => log.push(entry),
        signal: controller.signal,
      }),
    );
    assert.equal(log[0]?.outcome, "aborted");
  });

  it("keeps the reply and the saved Chat when the Turn Log cannot be written", async () => {
    const { agent } = fakeAgent();
    const saved: ChatMessage[] = [];
    const reply = await turn([], "hola", agent, saved, null, toolsOf, null, [], {
      saveTurnLog: () => {
        throw new Error("disk full");
      },
    });
    assert.equal(reply.text, "Hola, ¿qué necesitás?");
    assert.deepEqual(
      saved.map(({ role, text }) => [role, text]),
      [
        ["owner", "hola"],
        ["assistant", "Hola, ¿qué necesitás?"],
      ],
    );
  });
});

describe("chatMessageSchema", () => {
  it("accepts a message and rejects an empty text, an unknown role and a bad time", () => {
    assert.equal(chatMessageSchema.safeParse(message(0)).success, true);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), text: "" }).success, false);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), role: "system" }).success, false);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), at: "yesterday" }).success, false);
  });
});
