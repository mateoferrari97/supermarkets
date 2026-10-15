import { candidatesFor, snapshotTotal, type Candidate } from "../product-selection/candidates.ts";
import { rankBySelectionPolicy } from "../product-selection/selection-policy.ts";
import type { CatalogProduct } from "./catalog-product.ts";
import type { StaleId } from "./eval-set.ts";
import type { ItemRun, OrderRun, RunScore, Totals } from "./eval-score.ts";
import type { Item } from "./item.ts";

export type MatchedItem = {
  item: Item;
  matches: CatalogProduct[];
  fits: CatalogProduct[];
  alternatives: CatalogProduct[];
  note: string | null;
  question: string | null;
};

export type MatchedOrder = { items: MatchedItem[]; ignoredPreference: boolean };

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
};

export function pickOnSnapshot(item: Item, fits: CatalogProduct[]): Candidate | null {
  const priced = candidatesFor(item, fits).flatMap((candidate) => {
    const total = snapshotTotal(candidate);
    return total === null ? [] : [{ candidate, total, savings: 0 }];
  });
  return rankBySelectionPolicy(priced)[0]?.candidate ?? null;
}

export function orderRunOf({ items, ignoredPreference }: MatchedOrder): OrderRun {
  return { items: items.map(itemRunOf), ignoredPreference };
}

function itemRunOf(matched: MatchedItem): ItemRun {
  const ids = (products: CatalogProduct[]) => products.map(({ productId }) => productId);
  const pick = matched.question === null ? pickOnSnapshot(matched.item, matched.fits) : null;
  return {
    item: matched.item,
    matches: ids(matched.matches),
    fits: ids(matched.fits),
    alternatives: ids(matched.alternatives),
    note: matched.note,
    question: matched.question,
    pick:
      pick === null
        ? null
        : { productId: pick.product.productId, quantity: pick.quantity, notes: pick.notes },
  };
}
