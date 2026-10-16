import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { stepsFrom } from "../order-conversation/steps.ts";
import type { Topic } from "./route-message.ts";
import type { Judgment, PlanningTotals, PlanRun, Score } from "./eval-score.ts";
import { planWithinBudget } from "./plan-budget.ts";
import type { Plan, PlanLlm } from "./plan.ts";

export type IdeaToJudge = { request: string; message: string | null; plan: PlanRun["plan"] };

export type IdeaJudge = {
  judgeIdea(input: IdeaToJudge, signal: AbortSignal): Promise<Judgment>;
};

export type PlanFirstMessageDependencies = { llm: PlanLlm; search: CatalogSearch };

export type RouteCaseRunRecord = {
  error: string | null;
  topic: Topic | null;
  score: Score | null;
  durationMs: number;
  costUsd: number;
};

export type RouteCaseRecord = {
  id: string;
  message: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: RouteCaseRunRecord[];
};

export type PlanCaseRunRecord = {
  error: string | null;
  result: PlanRun | null;
  score: Score | null;
  judgment: Judgment | null;
  sessions: number;
  durationMs: number;
  costUsd: number;
};

export type PlanCaseRecord = {
  id: string;
  message: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: PlanCaseRunRecord[];
};

export type PlanningEvalRun = {
  startedAt: string;
  snapshotFetchedAt: string | null;
  models: string[];
  runsPerCase: number;
  filters: string[];
  durationMs: number;
  costUsd: number;
  sessions: number;
  stale: { caseId: string; productId: string; reason: "missing" | "out of stock" }[];
  totals: PlanningTotals;
  routes: RouteCaseRecord[];
  plans: PlanCaseRecord[];
};

export async function planFirstMessage(
  message: string,
  { llm, search }: PlanFirstMessageDependencies,
  signal: AbortSignal = new AbortController().signal,
): Promise<PlanRun> {
  const answered: Plan[] = [];
  const searches: string[][] = [];
  const recording: PlanLlm = {
    plan: async (input, callSignal) => {
      const output = await llm.plan(input, callSignal);
      if (output.kind === "answer" && output.plan !== null) answered.push(output.plan);
      return output;
    },
  };
  const turn = await planWithinBudget(
    { messages: [{ role: "owner", text: message }], products: [], lastPlan: null },
    { llm: recording, search },
    stepsFrom({
      signal,
      onStep: (event) => {
        if (event.status === "started" && event.step.kind === "search") {
          searches.push(event.step.queries);
        }
      },
    }),
  );
  if (turn.output.kind === "confirm") {
    throw new Error("plan answer breaks a rule: a confirm with no Plan shown");
  }
  const { message: reply, plan, budget } = turn.output;
  const shownIds = plan?.lines.map(({ product }) => product.productId).join(" ");
  const raw = answered.findLast(
    (candidate) =>
      [...new Set(candidate.lines.map(({ productId }) => productId))].join(" ") === shownIds,
  );
  return {
    message: reply,
    plan:
      plan === null
        ? null
        : {
            title: plan.title,
            idea: plan.idea,
            lines: plan.lines.map(({ product, quantity, purpose, total }) => ({
              productId: product.productId,
              name: product.name,
              sale: product.sale,
              quantity,
              purpose,
              total,
            })),
            total: plan.total,
          },
    budget,
    overBudget: turn.overBudget,
    repeatedProductIds:
      raw === undefined ? [] : repeated(raw.lines.map(({ productId }) => productId)),
    searches,
  };
}

function repeated(ids: string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
