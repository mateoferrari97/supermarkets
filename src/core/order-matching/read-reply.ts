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

export async function checkedReadReply(
  llm: ReadReplyLlm,
  input: ReadReplyInput,
  signal: AbortSignal,
): Promise<ReadReplyOutput> {
  return checkReadReply(input, await llm.readReply(input, signal));
}

export function checkReadReply(
  { items }: ReadReplyInput,
  { entries, newLines, ignoredPreference }: ReadReplyOutput,
): ReadReplyOutput {
  const fail = (entry: ReplyEntry, rule: string): never => {
    const item = items[entry.item - 1];
    const named = item === undefined ? "" : ` ("${item.original}")`;
    throw new Error(
      `read-reply answer for Item ${String(entry.item)}${named} breaks a rule: ${rule}`,
    );
  };
  const seen = new Set<number>();
  for (const entry of entries) {
    const item =
      items[entry.item - 1] ??
      fail(entry, `an entry only for one of its ${String(items.length)} listed Items`);
    if (seen.has(entry.item)) fail(entry, "one entry per Item");
    seen.add(entry.item);
    if (entry.kind === "choice") {
      if (item.kind !== "asked") fail(entry, "a choice only for an asked Item");
      else {
        const count = item.question.alternatives.length;
        if (
          !Number.isInteger(entry.alternative) ||
          entry.alternative < 1 ||
          entry.alternative > count
        ) {
          fail(
            entry,
            `a choice within its ${String(count)} Alternatives, not ${String(entry.alternative)}`,
          );
        }
      }
    }
    if (entry.kind === "unanswered" && item.kind === "bought" && entry.question === null) {
      fail(entry, "a question on an unanswered Item in the cart");
    }
  }
  const unanswered = items.flatMap((item, index): ReplyEntry[] =>
    item.kind === "asked" && !seen.has(index + 1)
      ? [{ item: index + 1, kind: "unanswered", question: null }]
      : [],
  );
  return {
    entries: [...entries, ...unanswered].sort((one, other) => one.item - other.item),
    newLines,
    ignoredPreference,
  };
}
