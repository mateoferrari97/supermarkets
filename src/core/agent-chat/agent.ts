import type { ChatMessage } from "./chat.ts";
import type { ChatOrder } from "./order.ts";
import type { Profile } from "./profile.ts";
import type { AgentTools } from "./tool.ts";

export type AgentTurn = {
  messages: ChatMessage[];
  profile: Profile | null;
  order: ChatOrder | null;
  pastOrders: ChatOrder[];
  tools: AgentTools;
  turnEnded: () => boolean;
};

export type ChatAgent = {
  reply(turn: AgentTurn, signal: AbortSignal): Promise<string>;
};
