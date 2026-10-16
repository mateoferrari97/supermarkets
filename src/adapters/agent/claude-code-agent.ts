import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolLoopAgent, type LanguageModel } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import type { AgentTurn, ChatAgent } from "../../core/agent-chat/agent.ts";
import { renderProfile, type AgentTools } from "../../core/agent-chat/tools.ts";

export const AGENT_MODEL = "sonnet";
export const AGENT_BUDGET_USD = 0.5;
export const AGENT_MAX_TURNS = 10;
export const AGENT_PROMPT_FILE = "agent/system.md";
export const AGENT_SERVER = "chat";

export type CreateAgentModel = (
  systemPrompt: string,
  tools: AgentTools,
  signal: AbortSignal,
) => LanguageModel;

export type ClaudeCodeAgentOptions = {
  promptsDir: string;
  createModel?: CreateAgentModel;
};

export const createClaudeCodeModel: CreateAgentModel = (systemPrompt, tools, signal) =>
  claudeCode(AGENT_MODEL, {
    systemPrompt,
    mcpServers: {
      [AGENT_SERVER]: createAiSdkMcpServer(
        AGENT_SERVER,
        Object.fromEntries(
          Object.entries(tools).map(([name, tool]) => [
            name,
            {
              description: tool.description,
              inputSchema: tool.inputSchema,
              execute: (input: unknown) => tool.execute(input, signal),
            },
          ]),
        ),
      ),
    },
    allowedTools: Object.keys(tools).map((name) => `mcp__${AGENT_SERVER}__${name}`),
    strictMcpConfig: true,
    settingSources: [],
    tools: [],
    persistSession: false,
    maxTurns: AGENT_MAX_TURNS,
    maxBudgetUsd: AGENT_BUDGET_USD,
  });

export function createClaudeCodeAgent({
  promptsDir,
  createModel = createClaudeCodeModel,
}: ClaudeCodeAgentOptions): ChatAgent {
  return {
    async reply({ messages, profile, tools }: AgentTurn, signal: AbortSignal): Promise<string> {
      const systemPrompt = `${readFileSync(join(promptsDir, AGENT_PROMPT_FILE), "utf8").trimEnd()}\n\n${renderProfile(profile)}\n`;
      const agent = new ToolLoopAgent({ model: createModel(systemPrompt, tools, signal) });
      const result = await agent.generate({
        messages: messages.map((message) => ({
          role: message.role === "owner" ? "user" : "assistant",
          content: message.text,
        })),
        abortSignal: signal,
      });
      const text = result.text.trim();
      if (text === "") throw new Error("The agent answered with no text.");
      return text;
    },
  };
}
