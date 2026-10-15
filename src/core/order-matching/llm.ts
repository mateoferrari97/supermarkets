import type { ParseOrderOutput } from "./item.ts";
import type { FitProductsInput, FitProductsOutput } from "./match-items.ts";
import type { ReadReplyInput, ReadReplyOutput } from "./read-reply.ts";

export type Llm = {
  parseOrder(orderText: string, signal: AbortSignal): Promise<ParseOrderOutput>;
  fitProducts(input: FitProductsInput, signal: AbortSignal): Promise<FitProductsOutput>;
  readReply(input: ReadReplyInput, signal: AbortSignal): Promise<ReadReplyOutput>;
};
