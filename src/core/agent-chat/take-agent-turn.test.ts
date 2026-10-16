import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { ChatAgent } from "./agent.ts";
import { CONTEXT_MESSAGES, chatMessageSchema, type ChatMessage } from "./chat.ts";
import { takeAgentTurn } from "./take-agent-turn.ts";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 16, 12, minute)).toISOString();

const message = (index: number): ChatMessage => ({
  role: index % 2 === 0 ? "owner" : "assistant",
  at: at(index % 60),
  text: `message ${index}`,
});

function fakeAgent(answer = "Hola, ¿qué necesitás?") {
  const seen: ChatMessage[][] = [];
  const agent: ChatAgent = {
    reply: (messages) => {
      seen.push(messages);
      return Promise.resolve(answer);
    },
  };
  return { agent, seen };
}

const turn = (history: ChatMessage[], text: string, agent: ChatAgent, saved: ChatMessage[] = []) =>
  takeAgentTurn(history, text, {
    agent,
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
