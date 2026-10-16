import type { ChatMessage } from "./chat.ts";
import type { Profile } from "./profile.ts";
import type { AgentTools } from "./tools.ts";

export type AgentTurn = {
  messages: ChatMessage[];
  profile: Profile | null;
  tools: AgentTools;
};

export type ChatAgent = {
  reply(turn: AgentTurn, signal: AbortSignal): Promise<string>;
};
