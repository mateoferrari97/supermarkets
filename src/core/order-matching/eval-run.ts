import { candidatesFor, snapshotTotal, type Candidate } from "../product-selection/candidates.ts";
import { rankBySelectionPolicy } from "../product-selection/selection-policy.ts";
import type { Llm } from "./llm.ts";
import type { CatalogProduct } from "./catalog-product.ts";
import type { CatalogSearch } from "./catalog-search.ts";
import type { AnswerScore } from "./eval-answers.ts";
import type { StaleId } from "./eval-set.ts";
import type { ItemRun, OrderRun, RunScore, Totals } from "./eval-score.ts";
import type { Item } from "./item.ts";
import { matchItems, type ItemMatch } from "./match-items.ts";
import type { ReadReplyOutput } from "./read-reply.ts";

export type MatchedOrder = { items: ItemMatch[]; ignoredPreference: boolean };

export type MatchOrderDependencies = {
  search: CatalogSearch;
  llm: Pick<Llm, "parseOrder" | "fitProducts">;
};

export type EvalCaseRunRecord = {
  error: string | null;
  result: OrderRun | null;
  score: RunScore | null;
  sessions: number;
  durationMs: number;
  costUsd: number;
};

export type EvalCaseRecord = {
  id: string;
  order: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: EvalCaseRunRecord[];
};

export type AnswerCaseRunRecord = {
  error: string | null;
  output: ReadReplyOutput | null;
  score: AnswerScore | null;
  durationMs: number;
  costUsd: number;
};

export type AnswerCaseRecord = {
  id: string;
  reply: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: AnswerCaseRunRecord[];
};

export type EvalRun = {
  startedAt: string;
  snapshotFetchedAt: string | null;
  models: string[];
  runsPerCase: number;
  filters: string[];
  durationMs: number;
  costUsd: number;
  sessions: number;
  stale: StaleId[];
  totals: Totals;
  cases: EvalCaseRecord[];
  answers: AnswerCaseRecord[];
};

export function pickOnSnapshot(item: Item, fits: CatalogProduct[]): Candidate | null {
  const priced = candidatesFor(item, fits).flatMap((candidate) => {
    const total = snapshotTotal(candidate);
    return total === null ? [] : [{ candidate, total, savings: 0 }];
  });
  return rankBySelectionPolicy(priced)[0]?.candidate ?? null;
}

export async function matchOrder(
  orderText: string,
  { search, llm }: MatchOrderDependencies,
  signal: AbortSignal = new AbortController().signal,
): Promise<MatchedOrder> {
  const { items, ignoredPreference } = await llm.parseOrder(orderText, signal);
  return { items: await matchItems(items, { search, llm }, { signal }), ignoredPreference };
}

export function orderRunOf({ items, ignoredPreference }: MatchedOrder): OrderRun {
  return { items: items.map(itemRunOf), ignoredPreference };
}

function itemRunOf(matched: ItemMatch): ItemRun {
  const ids = (products: CatalogProduct[]) => products.map(({ productId }) => productId);
  const pick = matched.question === null ? pickOnSnapshot(matched.item, matched.fits) : null;
  return {
    item: matched.item,
    matches: ids(matched.matches),
    fits: ids(matched.fits),
    alternatives: ids(matched.question?.alternatives ?? []),
    note: matched.note,
    question: matched.question?.text ?? null,
    pick:
      pick === null
        ? null
        : { productId: pick.product.productId, quantity: pick.quantity, notes: pick.notes },
  };
}
