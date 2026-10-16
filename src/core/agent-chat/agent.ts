import type { ChatMessage } from "./chat.ts";

export type ChatAgent = {
  reply(messages: ChatMessage[], signal: AbortSignal): Promise<string>;
};
