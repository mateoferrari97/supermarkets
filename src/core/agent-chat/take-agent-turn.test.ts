import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { AgentTurn, ChatAgent } from "./agent.ts";
import { CONTEXT_MESSAGES, chatMessageSchema, type ChatMessage } from "./chat.ts";
import type { Profile } from "./profile.ts";
import type { ChatOrder, Proposal } from "./order.ts";
import type { AgentTools, ToolsForTurn, TurnOutcome } from "./tool.ts";
import { takeAgentTurn } from "./take-agent-turn.ts";

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

const turn = (
  history: ChatMessage[],
  text: string,
  agent: ChatAgent,
  saved: ChatMessage[] = [],
  profile: Profile | null = null,
  tools: ToolsForTurn = toolsOf,
  order: ChatOrder | null = null,
) =>
  takeAgentTurn(history, text, {
    agent,
    profile,
    order,
    tools,
    save: (saved_) => saved.push(saved_),
    now: () => new Date(at(30)),
    signal: new AbortController().signal,
  });

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
    assert.equal(turns[0]?.tools, noTools);
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

describe("chatMessageSchema", () => {
  it("accepts a message and rejects an empty text, an unknown role and a bad time", () => {
    assert.equal(chatMessageSchema.safeParse(message(0)).success, true);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), text: "" }).success, false);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), role: "system" }).success, false);
    assert.equal(chatMessageSchema.safeParse({ ...message(0), at: "yesterday" }).success, false);
  });
});
