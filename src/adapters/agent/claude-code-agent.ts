import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolLoopAgent, type LanguageModel } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import type { ChatAgent } from "../../core/agent-chat/agent.ts";
import type { ChatMessage } from "../../core/agent-chat/chat.ts";

export const AGENT_MODEL = "sonnet";
export const AGENT_BUDGET_USD = 0.5;
export const AGENT_MAX_TURNS = 10;
export const AGENT_PROMPT_FILE = "agent/system.md";

export type CreateAgentModel = (systemPrompt: string) => LanguageModel;

export type ClaudeCodeAgentOptions = {
  promptsDir: string;
  createModel?: CreateAgentModel;
};

export const createClaudeCodeModel: CreateAgentModel = (systemPrompt) =>
  claudeCode(AGENT_MODEL, {
    systemPrompt,
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
    async reply(messages: ChatMessage[], signal: AbortSignal): Promise<string> {
      const systemPrompt = readFileSync(join(promptsDir, AGENT_PROMPT_FILE), "utf8");
      const agent = new ToolLoopAgent({ model: createModel(systemPrompt) });
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
