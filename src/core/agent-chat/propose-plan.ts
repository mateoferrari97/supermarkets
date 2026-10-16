import { z } from "zod";
import {
  amountOver,
  checkPlan,
  itemOfPlanLine,
  PLAN_LINES_LIMIT,
  type Plan,
} from "../planning/plan.ts";
import { candidateOf } from "../product-selection/selection.ts";
import { money } from "../product-selection/cart.ts";
import { openOrderOf, renderProposal, type OrderLine, type Proposal } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { PlanTurn } from "./plan-turn.ts";
import type { TurnOutcome } from "./tool.ts";

export const proposePlanInput = z.object({
  title: z
    .string()
    .min(1)
    .describe("A short title for the Plan, such as 'Lasaña de carne para 4'."),
  idea: z
    .array(z.object({ heading: z.string().min(1), text: z.string().min(1) }))
    .min(1)
    .describe(
      "The Idea, in sections the Owner reads: the ingredients and the steps of a recipe, the amounts per person of an event, one section per day of a menu, one per gift idea, or the advice.",
    ),
  lines: z
    .array(
      z.object({
        productId: z.string().describe("A productId that searchCatalog returned."),
        quantity: z
          .number()
          .describe(
            "Whole units of a packaged product, or whole grams of a product sold by weight.",
          ),
        purpose: z.string().min(1).describe("What the line is for, short, in Spanish."),
        reason: z.string().min(1).describe("Why this product, short, in Spanish."),
      }),
    )
    .min(1)
    .describe(`The Plan Lines, one per product, at most ${String(PLAN_LINES_LIMIT)}.`),
  budget: z
    .number()
    .optional()
    .describe("The Owner's budget in pesos, when they gave one in this conversation."),
  notes: z
    .array(z.string())
    .optional()
    .describe(
      "What the Owner should know and the card does not show, such as an ingredient you left out because no search found it.",
    ),
});

export type ProposePlanOutput =
  | { kind: "proposed"; proposalId: string; total: number; overBudget: number | null }
  | {
      kind: "refused";
      reason: "no-open-order" | "breaks-a-rule" | "no-price" | "over-budget";
      detail: string;
    };

export type ProposePlanDependencies = {
  orders: OrdersStore;
  outcome: TurnOutcome;
  turn: PlanTurn;
};

const refused = (
  reason: Extract<ProposePlanOutput, { kind: "refused" }>["reason"],
  detail: string,
): Promise<ProposePlanOutput> => Promise.resolve({ kind: "refused", reason, detail });

export function proposePlan(
  input: z.infer<typeof proposePlanInput>,
  { orders, outcome, turn }: ProposePlanDependencies,
): Promise<ProposePlanOutput> {
  const all = orders.load();
  const order = openOrderOf(all);
  const seen = order?.seen ?? [];
  if (order === null || seen.length === 0) {
    return refused("no-open-order", "No searchCatalog result of this Order to build a Plan from.");
  }
  const budget = input.budget ?? null;
  const plan: Plan = {
    title: input.title,
    idea: input.idea,
    lines: input.lines.map(({ productId, quantity, purpose, reason }) => ({
      productId,
      quantity,
      purpose,
      reason,
    })),
  };
  let shown;
  try {
    const checked = checkPlan(
      { messages: [], products: seen, lastPlan: null },
      { kind: "answer", message: "", plan, budget },
    );
    if (checked.kind !== "answer" || checked.plan === null) throw new Error("no Plan");
    shown = checked.plan;
  } catch (error) {
    return refused("breaks-a-rule", error instanceof Error ? error.message : String(error));
  }
  const unpriced = shown.lines.find((line) => line.total === null);
  if (unpriced) {
    return refused("no-price", `${unpriced.product.name} has no price in the catalog.`);
  }
  const over =
    budget !== null && shown.total > budget ? amountOver({ budget, total: shown.total }) : null;
  if (over !== null && !turn.overBudgetReturned) {
    turn.overBudgetReturned = true;
    return refused(
      "over-budget",
      `The Plan costs ${money(shown.total)} and the budget is ${money(budget!)}: it is over by ${money(over)}. Revise the whole Plan to cost at least that much less (cheaper products, smaller amounts or fewer extras) and call proposePlan again.`,
    );
  }
  const lines = shown.lines.map((line, index): OrderLine => {
    const planLine = shown.plan.lines[index]!;
    const candidate = candidateOf(itemOfPlanLine(planLine, line.product), line.product);
    const total = line.total!;
    return {
      description: line.purpose,
      productId: line.product.productId,
      itemId: line.product.itemId,
      name: line.product.name,
      brand: line.product.brand,
      quantity: candidate.quantity,
      unitPrice: total / candidate.quantity,
      total,
      reason: line.reason,
      notes: line.notes,
    };
  });
  const proposal: Proposal = {
    id: `${order.id}-${String(order.proposals + 1)}`,
    lines,
    notes: input.notes ?? [],
    total: shown.total,
    idea: { title: shown.title, sections: shown.idea },
    ...(over !== null && budget !== null
      ? { overBudget: { budget, total: shown.total, over } }
      : {}),
  };
  order.proposals += 1;
  order.proposal = proposal;
  order.status = "proposed";
  orders.save(all);
  if (order.reopened !== true) {
    outcome.ended = { text: renderProposal(proposal), parts: [{ type: "proposal", proposal }] };
  }
  return Promise.resolve({
    kind: "proposed",
    proposalId: proposal.id,
    total: proposal.total,
    overBudget: over,
  });
}
