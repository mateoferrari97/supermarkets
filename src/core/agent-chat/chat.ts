import { z } from "zod";

export const CONTEXT_MESSAGES = 40;

export const chatMessageSchema = z.object({
  role: z.enum(["owner", "assistant"]),
  at: z.iso.datetime(),
  text: z.string().min(1),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const contextMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-CONTEXT_MESSAGES);
