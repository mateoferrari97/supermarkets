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
  const retried = retry.output.plan;
  if (retried === null) return { ...first, products: retry.products, overBudget: over };
  return { ...retry, overBudget: overBudget(retried, retry.output.budget ?? budget) };
}
