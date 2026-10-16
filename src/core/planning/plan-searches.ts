import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Steps } from "../order-conversation/steps.ts";
import {
  checkedPlan,
  type CheckedPlanOutput,
  type PlanInput,
  type PlanLlm,
  type PlanSearch,
} from "./plan.ts";

export const PLAN_MATCHES_LIMIT = 20;

export const SEARCH_ROUNDS_LIMIT = 3;

export const SEARCH_GAVE_UP_TEXT =
  "No encontré en el catálogo lo que hace falta para esto. ¿Me lo pedís de otra forma o con otros productos?";

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
  const searches: PlanSearch[] = [];
  for (let round = 0; ; round++) {
    const output = await steps.run({ kind: "plan" }, () =>
      checkedPlan(
        llm,
        { ...input, products, ...(searches.length === 0 ? {} : { searches: [...searches] }) },
        steps.signal,
      ),
    );
    steps.signal.throwIfAborted();
    if (output.kind !== "search") return { output, products };
    if (round === SEARCH_ROUNDS_LIMIT) {
      return {
        output: { kind: "answer", message: SEARCH_GAVE_UP_TEXT, plan: null, budget: null },
        products,
      };
    }
    const { queries } = output;
    const found = await steps.run({ kind: "search", queries }, () =>
      Promise.resolve(
        queries.map((query) =>
          search.findMatches({ product: query, brand: null }, "plan", PLAN_MATCHES_LIMIT),
        ),
      ),
    );
    searches.push(...queries.map((query, index) => ({ query, found: found[index]!.length })));
    products = withoutRepeats([...products, ...found.flat()]);
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
