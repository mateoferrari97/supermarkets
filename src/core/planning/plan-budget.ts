import type { Steps } from "../order-conversation/steps.ts";
import { overBudget, type PlanInput } from "./plan.ts";
import {
  planWithSearches,
  type PlannedTurn,
  type PlanSearchDependencies,
} from "./plan-searches.ts";

export type PlannedWithinBudget = PlannedTurn & { overBudget: number | null };

export async function planWithinBudget(
  input: PlanInput,
  deps: PlanSearchDependencies,
  steps: Steps,
): Promise<PlannedWithinBudget> {
  const first = await planWithSearches(input, deps, steps);
  if (first.output.kind === "confirm") return { ...first, overBudget: null };
  const { plan, budget } = first.output;
  const over = plan === null ? null : overBudget(plan, budget);
  if (plan === null || budget === null || over === null) return { ...first, overBudget: null };
  const retry = await planWithSearches(
    {
      ...input,
      products: first.products,
      lastPlan: plan.plan,
      overBudget: { budget, total: plan.total },
    },
    deps,
    steps,
  );
  if (retry.output.kind === "confirm" || retry.output.plan === null) {
    return { ...first, products: retry.products, overBudget: over };
  }
  return {
    ...retry,
    overBudget: overBudget(retry.output.plan, retry.output.budget ?? budget),
  };
}
