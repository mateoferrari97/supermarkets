import { z } from "zod";
import type { ChatMessage, MessagePart } from "./chat.ts";
import type { TurnReporter } from "./turn-log.ts";

export type AgentTool = {
  description: string;
  inputSchema: z.ZodObject;
  endsTurn: boolean;
  execute: (input: unknown, signal: AbortSignal) => Promise<unknown>;
};

export type AgentTools = Record<string, AgentTool>;

export type TurnEnd = { text: string; parts: MessagePart[] };

export type TurnOutcome = { ended: TurnEnd | null };

export type ToolsForTurn = (
  outcome: TurnOutcome,
  messages?: ChatMessage[],
  reporter?: TurnReporter,
) => AgentTools;

export function defineTool<Schema extends z.ZodObject, Output>(
  description: string,
  inputSchema: Schema,
  run: (input: z.infer<Schema>, signal: AbortSignal) => Promise<Output>,
  endsTurn = false,
): AgentTool {
  return {
    description,
    inputSchema,
    endsTurn,
    execute: async (input, signal) => run(inputSchema.parse(input), signal),
  };
}
