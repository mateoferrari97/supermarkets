import { z } from "zod";
import { proposalSchema } from "./order.ts";

export const CONTEXT_MESSAGES = 40;

export const messagePartSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("proposal"), proposal: proposalSchema }),
]);

export type MessagePart = z.infer<typeof messagePartSchema>;

export const chatMessageSchema = z.object({
  role: z.enum(["owner", "assistant"]),
  at: z.iso.datetime(),
  text: z.string().min(1),
  parts: z.array(messagePartSchema).optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const contextMessages = (messages: ChatMessage[]): ChatMessage[] =>
  messages.slice(-CONTEXT_MESSAGES);
