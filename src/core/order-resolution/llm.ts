import type { ParseOrderOutput } from "../order-matching/item.ts";
import type { FitProductsInput, FitProductsOutput } from "../order-matching/match-items.ts";
import type { ReadReplyInput, ReadReplyOutput } from "../order-matching/read-reply.ts";
import type { Evidence, Item } from "./concepts.ts";

export type SplitOrderOutput = {
  items: Item[];
  ignoredPreference: boolean;
};

export type ResolveItemOutput = {
  kind: "match" | "ambiguous" | "none";
  candidates: string[];
};

export type MapAnswerOutput = {
  answers: {
    question: number;
    kind: "chosen" | "any" | "rephrased" | "unclear";
    options: number[];
    phrase: string | null;
  }[];
};

export type RewordItemOutput = { phrase: string };

export type ResolveItemInput = { item: Item; evidence: Evidence[] };

export type QuestionInput = {
  question: number;
  phrase: string;
  asks: "productType" | "phrase" | "term" | "size";
  term: string | null;
  options: { option: number; name: string }[];
};

export type MapAnswerInput = { questions: QuestionInput[]; answer: string };

export type Llm = {
  parseOrder(orderText: string, signal: AbortSignal): Promise<ParseOrderOutput>;
  fitProducts(input: FitProductsInput, signal: AbortSignal): Promise<FitProductsOutput>;
  readReply(input: ReadReplyInput, signal: AbortSignal): Promise<ReadReplyOutput>;
  splitOrder(orderText: string, signal: AbortSignal): Promise<SplitOrderOutput>;
  resolveItem(input: ResolveItemInput, signal: AbortSignal): Promise<ResolveItemOutput>;
  rewordItem(input: ResolveItemInput, signal: AbortSignal): Promise<RewordItemOutput>;
  mapAnswer(input: MapAnswerInput, signal: AbortSignal): Promise<MapAnswerOutput>;
};
