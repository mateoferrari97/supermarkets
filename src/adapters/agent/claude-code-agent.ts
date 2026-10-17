import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolLoopAgent, type LanguageModel } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import type { AgentTurn, ChatAgent } from "../../core/agent-chat/agent.ts";
import { renderOrder, renderPastOrders } from "../../core/agent-chat/order.ts";
import { renderProfile, type AgentTools } from "../../core/agent-chat/tools.ts";

export const AGENT_MODEL = "claude-sonnet-5-5";
export const AGENT_EFFORT = "low";
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
    effort: AGENT_EFFORT,
    env: { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
  });

export function createClaudeCodeAgent({
  promptsDir,
  createModel = createClaudeCodeModel,
}: ClaudeCodeAgentOptions): ChatAgent {
  return {
    async reply(
      { messages, profile, order, pastOrders, tools, turnEnded }: AgentTurn,
      signal: AbortSignal,
    ) {
      const systemPrompt = `${readFileSync(join(promptsDir, AGENT_PROMPT_FILE), "utf8").trimEnd()}\n\n${renderProfile(profile)}\n\n${renderOrder(order)}\n\n${renderPastOrders(pastOrders)}\n`;
      const turnEnd = new AbortController();
      let ended = false;
      const agent = new ToolLoopAgent({
        model: createModel(
          systemPrompt,
          endingTheTurn(tools, turnEnd, turnEnded, () => (ended = true)),
          signal,
        ),
      });
      let text: string;
      try {
        const result = await agent.generate({
          messages: messages.map((message) => ({
            role: message.role === "owner" ? "user" : "assistant",
            content: message.text,
          })),
          abortSignal: AbortSignal.any([signal, turnEnd.signal]),
        });
        text = result.text.trim();
      } catch (error) {
        if (!ended) throw error;
        return "";
      }
      if (text === "" && !ended) throw new Error("The agent answered with no text.");
      return text;
    },
  };
}

function endingTheTurn(
  tools: AgentTools,
  turnEnd: AbortController,
  turnEnded: () => boolean,
  markEnded: () => void,
): AgentTools {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      tool.endsTurn
        ? {
            ...tool,
            execute: async (input: unknown, signal: AbortSignal) => {
              const output = await tool.execute(input, signal);
              if (turnEnded()) {
                markEnded();
                turnEnd.abort();
              }
              return output;
            },
          }
        : tool,
    ]),
  );
}
