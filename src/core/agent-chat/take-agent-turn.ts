import type { ChatAgent } from "./agent.ts";
import { contextMessages, type ChatMessage } from "./chat.ts";
import type { ChatOrder } from "./order.ts";
import type { Profile } from "./profile.ts";
import type { ToolsForTurn, TurnOutcome } from "./tool.ts";

export type AgentTurnDependencies = {
  agent: ChatAgent;
  profile: Profile | null;
  order: ChatOrder | null;
  tools: ToolsForTurn;
  save: (message: ChatMessage) => void;
  now: () => Date;
  signal: AbortSignal;
};

export async function takeAgentTurn(
  history: ChatMessage[],
  text: string,
  { agent, profile, order, tools, save, now, signal }: AgentTurnDependencies,
): Promise<ChatMessage> {
  const ownerMessage: ChatMessage = { role: "owner", at: now().toISOString(), text };
  save(ownerMessage);
  const outcome: TurnOutcome = { ended: null };
  const reply = await agent.reply(
    {
      messages: contextMessages([...history, ownerMessage]),
      profile,
      order,
      tools: tools(outcome),
    },
    signal,
  );
  const at = now().toISOString();
  const assistantMessage: ChatMessage =
    outcome.ended === null
      ? { role: "assistant", at, text: reply }
      : { role: "assistant", at, text: outcome.ended.text, parts: outcome.ended.parts };
  save(assistantMessage);
  return assistantMessage;
}
