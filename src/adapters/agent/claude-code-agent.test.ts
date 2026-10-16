import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, it } from "vitest";
import type { ChatMessage } from "../../core/agent-chat/chat.ts";
import { createClaudeCodeAgent } from "./claude-code-agent.ts";

const at = "2026-10-16T12:00:00.000Z";

const messages: ChatMessage[] = [
  { role: "owner", at, text: "hola" },
  { role: "assistant", at, text: "Hola, ¿qué necesitás?" },
  { role: "owner", at, text: "qué podés hacer" },
];

const answering = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    },
  });

let promptsDir: string;

beforeEach(() => {
  promptsDir = mkdtempSync(join(tmpdir(), "agent-prompts-"));
  mkdirSync(join(promptsDir, "agent"));
  writeFileSync(join(promptsDir, "agent", "system.md"), "You are the Assistant.\n");
});

afterEach(() => {
  rmSync(promptsDir, { recursive: true, force: true });
});

describe("createClaudeCodeAgent", () => {
  it("sends the system prompt file and the messages, and returns the text", async () => {
    const model = answering("Puedo charlar por ahora.");
    const prompts: string[] = [];
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (systemPrompt) => {
        prompts.push(systemPrompt);
        return model;
      },
    });
    const reply = await agent.reply(messages, new AbortController().signal);
    assert.equal(reply, "Puedo charlar por ahora.");
    assert.deepEqual(prompts, ["You are the Assistant.\n"]);
    const sent = model.doGenerateCalls[0]?.prompt ?? [];
    assert.deepEqual(
      sent.map((message) => message.role),
      ["user", "assistant", "user"],
    );
  });

  it("reads the prompt file again on every turn", async () => {
    const prompts: string[] = [];
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (systemPrompt) => {
        prompts.push(systemPrompt);
        return answering("ok");
      },
    });
    await agent.reply(messages, new AbortController().signal);
    writeFileSync(join(promptsDir, "agent", "system.md"), "Changed.\n");
    await agent.reply(messages, new AbortController().signal);
    assert.deepEqual(prompts, ["You are the Assistant.\n", "Changed.\n"]);
  });

  it("fails when the model answers with no text", async () => {
    const agent = createClaudeCodeAgent({ promptsDir, createModel: () => answering("  ") });
    await assert.rejects(agent.reply(messages, new AbortController().signal), /no text/);
  });
});
