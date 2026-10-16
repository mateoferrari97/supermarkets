import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, it } from "vitest";
import type { ChatMessage } from "../../core/agent-chat/chat.ts";
import { z } from "zod";
import type { AgentTurn } from "../../core/agent-chat/agent.ts";
import { defineTool, renderProfile } from "../../core/agent-chat/tools.ts";
import { renderOrder } from "../../core/agent-chat/order.ts";
import { createClaudeCodeAgent, createClaudeCodeModel } from "./claude-code-agent.ts";

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

const turn = (overrides: Partial<AgentTurn> = {}): AgentTurn => ({
  messages,
  profile: null,
  order: null,
  tools: {},
  ...overrides,
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
    const reply = await agent.reply(turn(), new AbortController().signal);
    assert.equal(reply, "Puedo charlar por ahora.");
    assert.deepEqual(prompts, [
      "You are the Assistant.\n\n" + renderProfile(null) + "\n\n" + renderOrder(null) + "\n",
    ]);
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
    await agent.reply(turn(), new AbortController().signal);
    writeFileSync(join(promptsDir, "agent", "system.md"), "Changed.\n");
    await agent.reply(turn(), new AbortController().signal);
    assert.deepEqual(prompts, [
      "You are the Assistant.\n\n" + renderProfile(null) + "\n\n" + renderOrder(null) + "\n",
      "Changed.\n\n" + renderProfile(null) + "\n\n" + renderOrder(null) + "\n",
    ]);
  });

  it("puts the Profile in the system prompt and hands the tools to the model factory", async () => {
    const prompts: string[] = [];
    const toolNames: string[][] = [];
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (systemPrompt, tools) => {
        prompts.push(systemPrompt);
        toolNames.push(Object.keys(tools));
        return answering("ok");
      },
    });
    const tools = {
      updateProfile: defineTool("Saves.", z.object({ postalCode: z.string() }), () =>
        Promise.resolve({ kind: "saved" }),
      ),
    };
    await agent.reply(
      turn({ profile: { postalCode: "1425" }, tools }),
      new AbortController().signal,
    );
    assert.match(prompts[0] ?? "", /^You are the Assistant\.\n\n<profile>\npostalCode: 1425\n/);
    assert.deepEqual(toolNames, [["updateProfile"]]);
  });

  it("builds a session whose MCP server holds the tools and allows only them", () => {
    const tools = {
      updateProfile: defineTool("Saves.", z.object({ postalCode: z.string() }), () =>
        Promise.resolve({ kind: "saved" }),
      ),
    };
    const model = createClaudeCodeModel("prompt", tools, new AbortController().signal);
    const settings = (model as unknown as { settings: Record<string, unknown> }).settings;
    assert.deepEqual(settings.allowedTools, ["mcp__chat__updateProfile"]);
    assert.deepEqual(Object.keys(settings.mcpServers as object), ["chat"]);
  });

  it("puts the open Order in the system prompt", async () => {
    const prompts: string[] = [];
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (systemPrompt) => {
        prompts.push(systemPrompt);
        return answering("ok");
      },
    });
    await agent.reply(
      turn({
        order: {
          id: "order-1",
          status: "draft",
          openedAt: at,
          items: [{ kind: "none", ref: "1", description: "bicicleta", note: "x" }],
          proposals: 0,
          proposal: null,
        },
      }),
      new AbortController().signal,
    );
    assert.match(prompts[0] ?? "", /<order>\nid: order-1\nstatus: draft/);
    assert.match(prompts[0] ?? "", /- ref 1: "bicicleta" was not found/);
  });

  it("stops the session when a tool that ends the turn has answered", async () => {
    const executed: string[] = [];
    const tools = {
      look: defineTool("Looks.", z.object({}), () => {
        executed.push("look");
        return Promise.resolve({});
      }),
      propose: defineTool(
        "Ends the turn.",
        z.object({}),
        () => {
          executed.push("propose");
          return Promise.resolve({ kind: "proposed" });
        },
        true,
      ),
    };
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (_prompt, wrapped, signal) =>
        new MockLanguageModelV4({
          doGenerate: async (options) => {
            await wrapped.look?.execute({}, signal);
            assert.equal(options.abortSignal?.aborted, false);
            await wrapped.propose?.execute({}, signal);
            assert.equal(options.abortSignal?.aborted, true);
            throw new DOMException("aborted", "AbortError");
          },
        }),
    });
    const reply = await agent.reply(turn({ tools }), new AbortController().signal);
    assert.equal(reply, "");
    assert.deepEqual(executed, ["look", "propose"]);
  });

  it("rethrows a failure of the session when no tool ended the turn", async () => {
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: () =>
        new MockLanguageModelV4({
          doGenerate: () => Promise.reject(new Error("session failed")),
        }),
    });
    await assert.rejects(agent.reply(turn(), new AbortController().signal), /session failed/);
  });

  it("fails when the model answers with no text", async () => {
    const agent = createClaudeCodeAgent({ promptsDir, createModel: () => answering("  ") });
    await assert.rejects(agent.reply(turn(), new AbortController().signal), /no text/);
  });
});
