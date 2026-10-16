import type { ChatAgent } from "./agent.ts";
import { contextMessages, type ChatMessage } from "./chat.ts";

export type AgentTurnDependencies = {
  agent: ChatAgent;
  save: (message: ChatMessage) => void;
  now: () => Date;
  signal: AbortSignal;
};

export async function takeAgentTurn(
  history: ChatMessage[],
  text: string,
  { agent, save, now, signal }: AgentTurnDependencies,
): Promise<ChatMessage> {
  const ownerMessage: ChatMessage = { role: "owner", at: now().toISOString(), text };
  save(ownerMessage);
  const reply = await agent.reply(contextMessages([...history, ownerMessage]), signal);
  const assistantMessage: ChatMessage = { role: "assistant", at: now().toISOString(), text: reply };
  save(assistantMessage);
  return assistantMessage;
}
