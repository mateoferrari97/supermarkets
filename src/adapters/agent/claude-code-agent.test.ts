import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, it } from "vitest";
import type { ChatMessage } from "../../core/agent-chat/chat.ts";
import { z } from "zod";
import type { AgentTurn } from "../../core/agent-chat/agent.ts";
import type { AgentSessionReport } from "../../core/agent-chat/turn-log.ts";
import { defineTool, renderProfile } from "../../core/agent-chat/tools.ts";
import { renderOrder, renderPastOrders } from "../../core/agent-chat/order.ts";
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
  pastOrders: [],
  tools: {},
  turnEnded: () => true,
  reportSession: () => undefined,
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
      "You are the Assistant.\n\n" +
        renderProfile(null) +
        "\n\n" +
        renderOrder(null) +
        "\n\n" +
        renderPastOrders([]) +
        "\n",
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
      "You are the Assistant.\n\n" +
        renderProfile(null) +
        "\n\n" +
        renderOrder(null) +
        "\n\n" +
        renderPastOrders([]) +
        "\n",
      "Changed.\n\n" +
        renderProfile(null) +
        "\n\n" +
        renderOrder(null) +
        "\n\n" +
        renderPastOrders([]) +
        "\n",
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

  it("runs Sonnet 5.5 at low effort", () => {
    const model = createClaudeCodeModel("prompt", {}, new AbortController().signal);
    const settings = (model as unknown as { settings: Record<string, unknown> }).settings;
    assert.equal((model as unknown as { modelId: string }).modelId, "claude-sonnet-5-5");
    assert.equal(settings.effort, "low");
  });

  it("starts the session with nonessential traffic turned off", () => {
    const model = createClaudeCodeModel("prompt", {}, new AbortController().signal);
    const settings = (model as unknown as { settings: Record<string, unknown> }).settings;
    assert.deepEqual(settings.env, { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" });
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
    const reports: AgentSessionReport[] = [];
    const reply = await agent.reply(
      turn({ tools, reportSession: (report) => reports.push(report) }),
      new AbortController().signal,
    );
    assert.equal(reply, "");
    assert.deepEqual(executed, ["look", "propose"]);
    assert.deepEqual(reports, []);
  });

  it("keeps the session going when a tool that may end the turn refused", async () => {
    const tools = {
      build: defineTool(
        "May end the turn.",
        z.object({}),
        () => Promise.resolve({ kind: "refused" }),
        true,
      ),
    };
    let abortedAfterRefusal: boolean | undefined;
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: (_prompt, wrapped, signal) =>
        new MockLanguageModelV4({
          doGenerate: async (options) => {
            await wrapped.build?.execute({}, signal);
            abortedAfterRefusal = options.abortSignal?.aborted;
            return {
              content: [{ type: "text", text: "No pude armar el carrito." }],
              finishReason: { unified: "stop", raw: "stop" },
              usage: {
                inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                outputTokens: { total: 1, text: 1, reasoning: 0 },
              },
              warnings: [],
            };
          },
        }),
    });
    const reply = await agent.reply(
      turn({ tools, turnEnded: () => false }),
      new AbortController().signal,
    );
    assert.equal(abortedAfterRefusal, false);
    assert.equal(reply, "No pude armar el carrito.");
  });

  it("reports the session's duration, cost and tokens when it returns a result", async () => {
    const agent = createClaudeCodeAgent({
      promptsDir,
      createModel: () =>
        new MockLanguageModelV4({
          doGenerate: {
            content: [{ type: "text", text: "Hola" }],
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 5130, noCache: 30, cacheRead: 4000, cacheWrite: 1100 },
              outputTokens: { total: 85, text: 85, reasoning: 0 },
            },
            providerMetadata: {
              "claude-code": { sessionId: "s-1", costUsd: 0.0123, durationMs: 2500 },
            },
            warnings: [],
          },
        }),
    });
    const reports: AgentSessionReport[] = [];
    await agent.reply(
      turn({ reportSession: (report) => reports.push(report) }),
      new AbortController().signal,
    );
    assert.deepEqual(reports, [
      {
        durationMs: 2500,
        costUsd: 0.0123,
        inputTokens: 30,
        outputTokens: 85,
        cacheReadTokens: 4000,
        cacheWriteTokens: 1100,
      },
    ]);
  });

  it("reports null for what the provider does not give", async () => {
    const reports: AgentSessionReport[] = [];
    const agent = createClaudeCodeAgent({ promptsDir, createModel: () => answering("Hola") });
    await agent.reply(
      turn({ reportSession: (report) => reports.push(report) }),
      new AbortController().signal,
    );
    assert.equal(reports[0]?.durationMs, null);
    assert.equal(reports[0]?.costUsd, null);
    assert.equal(reports[0]?.outputTokens, 1);
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
