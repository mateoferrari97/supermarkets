import type { ParseOrderOutput } from "./item.ts";
import type { FitProductsInput, FitProductsOutput } from "./match-items.ts";
import type { ReadReplyInput, ReadReplyOutput } from "./read-reply.ts";
import type { RouteMessageOutput } from "../planning/route-message.ts";

export type Llm = {
  routeMessage(text: string, signal: AbortSignal): Promise<RouteMessageOutput>;
  parseOrder(orderText: string, signal: AbortSignal): Promise<ParseOrderOutput>;
  fitProducts(input: FitProductsInput, signal: AbortSignal): Promise<FitProductsOutput>;
  readReply(input: ReadReplyInput, signal: AbortSignal): Promise<ReadReplyOutput>;
};
