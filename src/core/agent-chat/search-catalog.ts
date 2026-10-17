import { z } from "zod";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { PLAN_MATCHES_LIMIT, PLAN_QUERIES_LIMIT, SEARCH_ROUNDS_LIMIT } from "../planning/plan.ts";
import { openOrder, seenRow } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { PlanTurn } from "./plan-turn.ts";
import type { Profile } from "./profile.ts";

export const searchCatalogInput = z.object({
  queries: z
    .array(z.string().min(1))
    .min(1)
    .describe(
      `Up to ${String(PLAN_QUERIES_LIMIT)} searches, each the plain product name as a supermarket shelf calls it, such as "tapas para lasaña" or "fideos sin TACC".`,
    ),
});

export type SearchCatalogOutput =
  | { kind: "found"; results: { query: string; found: number; products: string[] }[] }
  | {
      kind: "refused";
      reason: "no-postal-code" | "too-many-queries" | "too-many-searches";
    };

export type SearchCatalogDependencies = {
  search: CatalogSearch;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  now: () => Date;
  turn: PlanTurn;
};

export function searchCatalog(
  input: z.infer<typeof searchCatalogInput>,
  { search, orders, loadProfile, now, turn }: SearchCatalogDependencies,
): Promise<SearchCatalogOutput> {
  if (loadProfile() === null) return Promise.resolve({ kind: "refused", reason: "no-postal-code" });
  if (input.queries.length > PLAN_QUERIES_LIMIT) {
    return Promise.resolve({ kind: "refused", reason: "too-many-queries" });
  }
  if (turn.searches >= SEARCH_ROUNDS_LIMIT) {
    return Promise.resolve({ kind: "refused", reason: "too-many-searches" });
  }
  turn.searches += 1;
  const found = input.queries.map((query) =>
    search.findMatches({ product: query, brand: null }, "plan", PLAN_MATCHES_LIMIT),
  );
  const all = orders.load();
  const order = openOrder(all, now());
  order.seen = withoutRepeats([...(order.seen ?? []), ...found.flat()]);
  orders.save(all);
  return Promise.resolve({
    kind: "found",
    results: input.queries.map((query, index) => ({
      query,
      found: found[index]!.length,
      products: found[index]!.map(seenRow),
    })),
  });
}

function withoutRepeats(products: CatalogProduct[]): CatalogProduct[] {
  const seen = new Set<string>();
  return products.filter(({ productId }) => {
    if (seen.has(productId)) return false;
    seen.add(productId);
    return true;
  });
}
