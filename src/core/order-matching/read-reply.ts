import type { CatalogProduct } from "./catalog-product.ts";
import type { Item } from "./item.ts";
import type { Question } from "./match-items.ts";

export type ReplyItem =
  | { kind: "asked"; original: string; question: Question }
  | { kind: "bought"; original: string; product: CatalogProduct };

export type ReadReplyInput = { items: ReplyItem[]; reply: string };

export type ReplyEntry =
  | { item: number; kind: "choice"; alternative: number }
  | { item: number; kind: "lines"; lines: Item[] }
  | { item: number; kind: "drop" }
  | { item: number; kind: "unanswered"; question: string | null };

export type ReadReplyOutput = {
  entries: ReplyEntry[];
  newLines: Item[];
  ignoredPreference: boolean;
};

export type ReadReplyLlm = {
  readReply(input: ReadReplyInput, signal: AbortSignal): Promise<ReadReplyOutput>;
};
