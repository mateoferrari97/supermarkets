import type { Sale } from "../order-matching/catalog-product.ts";
import { normalize } from "../order-matching/text.ts";
import type { PlanCase, QuantityRange, RouteCase } from "./eval-set.ts";
import type { IdeaSection } from "./plan.ts";
import type { Topic } from "./route-message.ts";

export type PlanRunLine = {
  productId: string;
  name: string;
  sale: Sale;
  quantity: number;
  purpose: string;
  total: number | null;
};

export type PlanRun = {
  message: string | null;
  plan: { title: string; idea: IdeaSection[]; lines: PlanRunLine[]; total: number } | null;
  budget: number | null;
  overBudget: number | null;
  repeatedProductIds: string[];
  searches: string[][];
};

export type Score = { passed: boolean; problems: string[] };

export type Judgment = { sensible: boolean; reason: string };

export type ScoredRun = { error: null; score: Score } | { error: string };

export type Ratio = { hits: number; total: number };

export type CaseSummary = {
  id: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: { error: string | null; judgment?: Judgment | null }[];
};

export type PlanningTotals = {
  routes: Ratio;
  plans: Ratio;
  unexpectedFailures: string[];
  errors: Ratio;
  sensibleIdeas: Ratio;
};

export function scoreRoute(routeCase: RouteCase, topic: Topic): Score {
  return scored(
    topic === routeCase.topic ? [] : [`Topic "${topic}", expected "${routeCase.topic}"`],
  );
}

export function scorePlanRun(
  planCase: PlanCase,
  run: PlanRun,
  inStock: (productId: string) => boolean,
): Score {
  const { plan } = run;
  if (plan === null) return scored(planCase.plan ? ["no Plan shown"] : []);
  if (!planCase.plan) return scored(["a Plan shown when none was expected"]);
  const problems: string[] = [];
  const named = ({ name, productId }: PlanRunLine) => `line "${name}" (${productId})`;
  for (const line of plan.lines) {
    if (!inStock(line.productId)) {
      problems.push(`${named(line)} is not in stock in the Catalog Snapshot`);
    }
  }
  if (planCase.budget !== undefined && plan.total > planCase.budget) {
    problems.push(`total ${pesos(plan.total)} is over the budget of ${pesos(planCase.budget)}`);
  }
  for (const range of planCase.quantities ?? []) problems.push(...rangeProblems(range, plan.lines));
  const allowed = planCase.allowedWords ?? [];
  for (const line of plan.lines) {
    if (planCase.forbiddenProductIds?.includes(line.productId)) {
      problems.push(`${named(line)} is a forbidden product`);
      continue;
    }
    if (allowed.some((word) => hasWord(line.name, word))) continue;
    const word = planCase.forbiddenWords?.find((forbidden) => hasWord(line.name, forbidden));
    if (word !== undefined) problems.push(`${named(line)} has the forbidden word "${word}"`);
  }
  for (const productId of run.repeatedProductIds) {
    problems.push(`product ${productId} is on more than one line of the planner's Plan`);
  }
  if (planCase.idea !== undefined) {
    const { headings, min } = planCase.idea;
    const sections = plan.idea.filter(
      ({ heading }) => headings === undefined || headings.some((word) => hasWord(heading, word)),
    ).length;
    if (sections < min) {
      const kind =
        headings === undefined
          ? ""
          : ` headed ${headings.map((heading) => `"${heading}"`).join(" or ")}`;
      problems.push(
        `Idea has ${String(sections)} sections${kind}, expected at least ${String(min)}`,
      );
    }
  }
  return scored(problems);
}

function rangeProblems(
  { label, productIds, unit, min, max }: QuantityRange,
  lines: PlanRunLine[],
): string[] {
  const problems: string[] = [];
  let amount = 0;
  for (const line of lines.filter(({ productId }) => productIds.includes(productId))) {
    const measured = measure(line, unit);
    if (measured === null) {
      problems.push(
        `${label}: line "${line.name}" (${line.productId}) cannot be measured in ${unit}`,
      );
    } else {
      amount += measured;
    }
  }
  if (amount < min || amount > max) {
    problems.push(
      `${label}: ${String(amount)} ${unit}, expected ${String(min)} to ${String(max)} ${unit}`,
    );
  }
  return problems;
}

function measure({ sale, quantity }: PlanRunLine, unit: QuantityRange["unit"]): number | null {
  if (sale.kind === "by-weight") return unit === "g" ? quantity : null;
  if (unit === "unit") return quantity;
  const dimension = unit === "g" ? "weight" : "volume";
  return sale.size?.dimension === dimension ? quantity * sale.size.amount : null;
}

function hasWord(text: string, word: string): boolean {
  return ` ${normalize(text)} `.includes(` ${normalize(word)} `);
}

export function pesos(amount: number): string {
  return `$${String(Math.round(amount * 100) / 100)}`;
}

function scored(problems: string[]): Score {
  return { passed: problems.length === 0, problems };
}

export function casePassed(runs: ScoredRun[]): boolean {
  return runs.every((run) => run.error === null && run.score.passed);
}

export function summarizePlanning(routes: CaseSummary[], plans: CaseSummary[]): PlanningTotals {
  const passed = (cases: CaseSummary[]) => ({
    hits: cases.filter(({ passed }) => passed).length,
    total: cases.length,
  });
  const runs = [...routes, ...plans].flatMap((summary) => summary.runs);
  const judgments = plans.flatMap((summary) =>
    summary.runs.flatMap(({ judgment }) => (judgment ? [judgment] : [])),
  );
  return {
    routes: passed(routes),
    plans: passed(plans),
    unexpectedFailures: [...routes, ...plans]
      .filter(({ passed, expectedToFail }) => !passed && expectedToFail === null)
      .map(({ id }) => id),
    errors: { hits: runs.filter(({ error }) => error !== null).length, total: runs.length },
    sensibleIdeas: {
      hits: judgments.filter(({ sensible }) => sensible).length,
      total: judgments.length,
    },
  };
}
