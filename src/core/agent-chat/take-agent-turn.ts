import type { ChatAgent } from "./agent.ts";
import { contextMessages, type ChatMessage } from "./chat.ts";
import { lastClosedOrders, type ChatOrder } from "./order.ts";
import type { Profile } from "./profile.ts";
import type { ToolsForTurn, TurnOutcome } from "./tool.ts";

export type AgentTurnDependencies = {
  agent: ChatAgent;
  profile: Profile | null;
  order: ChatOrder | null;
  orders?: ChatOrder[];
  tools: ToolsForTurn;
  save: (message: ChatMessage) => void;
  now: () => Date;
  signal: AbortSignal;
};

export async function takeAgentTurn(
  history: ChatMessage[],
  text: string,
  { agent, profile, order, orders = [], tools, save, now, signal }: AgentTurnDependencies,
): Promise<ChatMessage> {
  const ownerMessage: ChatMessage = { role: "owner", at: now().toISOString(), text };
  save(ownerMessage);
  const outcome: TurnOutcome = { ended: null };
  const reply = await agent.reply(
    {
      messages: contextMessages([...history, ownerMessage]),
      profile,
      order,
      pastOrders: lastClosedOrders(orders),
      tools: tools(outcome, [...history, ownerMessage]),
      turnEnded: () => outcome.ended !== null,
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
