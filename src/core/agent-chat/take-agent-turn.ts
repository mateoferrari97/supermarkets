import type { ChatAgent } from "./agent.ts";
import { contextMessages, type ChatMessage } from "./chat.ts";
import type { Profile } from "./profile.ts";
import type { AgentTools } from "./tools.ts";

export type AgentTurnDependencies = {
  agent: ChatAgent;
  profile: Profile | null;
  tools: AgentTools;
  save: (message: ChatMessage) => void;
  now: () => Date;
  signal: AbortSignal;
};

export async function takeAgentTurn(
  history: ChatMessage[],
  text: string,
  { agent, profile, tools, save, now, signal }: AgentTurnDependencies,
): Promise<ChatMessage> {
  const ownerMessage: ChatMessage = { role: "owner", at: now().toISOString(), text };
  save(ownerMessage);
  const reply = await agent.reply(
    { messages: contextMessages([...history, ownerMessage]), profile, tools },
    signal,
  );
  const assistantMessage: ChatMessage = { role: "assistant", at: now().toISOString(), text: reply };
  save(assistantMessage);
  return assistantMessage;
}
