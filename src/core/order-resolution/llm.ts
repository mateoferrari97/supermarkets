import type { Evidence, Item, SelectionPolicy } from "./concepts.ts";

export type SplitOrderOutput = {
  items: Item[];
  paymentCard: string | null;
  preference: string | null;
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

export type TranslatePreferenceInput = { preference: string };

export type Llm = {
  splitOrder(orderText: string, signal: AbortSignal): Promise<SplitOrderOutput>;
  resolveItem(input: ResolveItemInput, signal: AbortSignal): Promise<ResolveItemOutput>;
  rewordItem(input: ResolveItemInput, signal: AbortSignal): Promise<RewordItemOutput>;
  mapAnswer(input: MapAnswerInput, signal: AbortSignal): Promise<MapAnswerOutput>;
  translatePreference(
    input: TranslatePreferenceInput,
    signal: AbortSignal,
  ): Promise<SelectionPolicy>;
};
