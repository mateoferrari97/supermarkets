import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import { roundMeasure, type Item } from "../order-matching/item.ts";
import { candidateOf, snapshotTotal } from "../product-selection/selection.ts";

export const PLAN_QUERIES_LIMIT = 8;

export const PLAN_LINES_LIMIT = 60;

export type IdeaSection = { heading: string; text: string };

export type PlanLine = { productId: string; quantity: number; purpose: string; reason: string };

export type Plan = { title: string; idea: IdeaSection[]; lines: PlanLine[] };

export type PlanIdea = { title: string; sections: IdeaSection[] };

export type PlanMessage = { role: "owner" | "planner"; text: string };

export type PlanInput = {
  messages: PlanMessage[];
  products: CatalogProduct[];
  lastPlan: Plan | null;
};

export type PlanOutput =
  | { kind: "search"; queries: string[] }
  | { kind: "answer"; message: string; plan: Plan | null }
  | { kind: "confirm" };

export type PlanLlm = {
  plan(input: PlanInput, signal: AbortSignal): Promise<PlanOutput>;
};

export type PlanLineShown = {
  product: CatalogProduct;
  quantity: number;
  purpose: string;
  reason: string;
  notes: string[];
  total: number | null;
};

export type PlanShown = {
  title: string;
  idea: IdeaSection[];
  lines: PlanLineShown[];
  total: number;
  plan: Plan;
};

export type CheckedPlanOutput =
  | { kind: "search"; queries: string[] }
  | { kind: "answer"; message: string; plan: PlanShown | null }
  | { kind: "confirm" };

export async function checkedPlan(
  llm: PlanLlm,
  input: PlanInput,
  signal: AbortSignal,
): Promise<CheckedPlanOutput> {
  return checkPlan(input, await llm.plan(input, signal));
}

export function checkPlan(input: PlanInput, output: PlanOutput): CheckedPlanOutput {
  if (output.kind === "search") {
    if (output.queries.length > PLAN_QUERIES_LIMIT) {
      fail(`${String(output.queries.length)} queries, more than ${String(PLAN_QUERIES_LIMIT)}`);
    }
    return output;
  }
  if (output.kind === "confirm") {
    if (input.lastPlan === null) fail("a confirm with no Plan shown");
    return output;
  }
  return {
    kind: "answer",
    message: output.message,
    plan: output.plan === null ? null : shownPlan(output.plan, input.products),
  };
}

function shownPlan(plan: Plan, seen: CatalogProduct[]): PlanShown {
  if (plan.lines.length > PLAN_LINES_LIMIT) {
    fail(`${String(plan.lines.length)} lines, more than ${String(PLAN_LINES_LIMIT)}`);
  }
  const lines = plan.lines.map((line) => shownLine(line, seen));
  return {
    title: plan.title,
    idea: plan.idea,
    lines,
    total: lines.reduce((sum, { total }) => sum + (total ?? 0), 0),
    plan: {
      ...plan,
      lines: plan.lines.map((line, index) => ({ ...line, quantity: lines[index]!.quantity })),
    },
  };
}

function shownLine(line: PlanLine, seen: CatalogProduct[]): PlanLineShown {
  const { productId, quantity, purpose, reason } = line;
  const product = seen.find((known) => known.productId === productId);
  if (!product) fail(`product ${productId} was not returned by a search of this conversation`);
  if (!(quantity > 0)) fail(`quantity ${String(quantity)} of product ${productId} is not positive`);
  if (!Number.isInteger(quantity)) {
    fail(
      product.sale.kind === "packaged"
        ? `quantity ${String(quantity)} of packaged product ${productId} is not a whole number of units`
        : `quantity ${String(quantity)} of by-weight product ${productId} is not in whole grams`,
    );
  }
  const candidate = candidateOf(itemOfPlanLine(line, product), product);
  return {
    product,
    quantity:
      product.sale.kind === "by-weight"
        ? roundMeasure(candidate.quantity * product.sale.saleStepKg * 1000)
        : candidate.quantity,
    purpose,
    reason,
    notes: candidate.notes,
    total: snapshotTotal(candidate),
  };
}

export function itemOfPlanLine({ quantity, purpose }: PlanLine, product: CatalogProduct): Item {
  return {
    original: `${product.name} — ${purpose}`,
    product: product.name,
    brand: product.brand,
    size: { kind: "common" },
    quantity:
      product.sale.kind === "by-weight"
        ? { kind: "weight", grams: quantity }
        : { kind: "units", count: quantity },
  };
}

function fail(rule: string): never {
  throw new Error(`plan answer breaks a rule: ${rule}`);
}
