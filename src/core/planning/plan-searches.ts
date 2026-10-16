import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Steps } from "../order-conversation/steps.ts";
import { checkedPlan, type CheckedPlanOutput, type PlanInput, type PlanLlm } from "./plan.ts";

export const PLAN_MATCHES_LIMIT = 20;

export const SEARCH_ROUNDS_LIMIT = 3;

export type PlanSearchDependencies = { llm: PlanLlm; search: CatalogSearch };

export type PlannedTurn = {
  output: Exclude<CheckedPlanOutput, { kind: "search" }>;
  products: CatalogProduct[];
};

export async function planWithSearches(
  input: PlanInput,
  { llm, search }: PlanSearchDependencies,
  steps: Steps,
): Promise<PlannedTurn> {
  let products = input.products;
  for (let round = 0; ; round++) {
    const output = await steps.run({ kind: "plan" }, () =>
      checkedPlan(llm, { ...input, products }, steps.signal),
    );
    steps.signal.throwIfAborted();
    if (output.kind !== "search") return { output, products };
    if (round === SEARCH_ROUNDS_LIMIT) {
      throw new Error(
        `plan answer breaks a rule: a fourth search in one turn, more than ${String(SEARCH_ROUNDS_LIMIT)}`,
      );
    }
    const { queries } = output;
    const found = await steps.run({ kind: "search", queries }, () =>
      Promise.resolve(
        queries.flatMap((query) =>
          search.findMatches({ product: query, brand: null }, PLAN_MATCHES_LIMIT),
        ),
      ),
    );
    products = withoutRepeats([...products, ...found]);
  }
}

function withoutRepeats(products: CatalogProduct[]): CatalogProduct[] {
  const seen = new Set<string>();
  return products.filter(({ productId }) => {
    if (seen.has(productId)) return false;
    seen.add(productId);
    return true;
  });
}
