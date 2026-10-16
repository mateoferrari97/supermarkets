import {
  createPlanningEvaluator,
  loadPlanningEvalSet,
  savePlanningEvalRun,
  type LlmCall,
} from "../compose.ts";
import type {
  PlanCaseRecord,
  PlanCaseRunRecord,
  PlanningEvalRun,
  RouteCaseRecord,
  RouteCaseRunRecord,
} from "../core/planning/eval-run.ts";
import {
  casePassed,
  scorePlanRun,
  scoreRoute,
  summarizePlanning,
  type Judgment,
  type Score,
  type ScoredRun,
} from "../core/planning/eval-score.ts";
import { planningEvalSetIds } from "../core/planning/eval-set.ts";
import { formatPlanningReport } from "./plan-eval-report.ts";
import { fail, valueOf } from "./report.ts";

const args = process.argv.slice(2);
const runsFlag = args.indexOf("--runs");
const runsPerCase = runsFlag === -1 ? 3 : Number(args[runsFlag + 1]);
if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
  fail(["Usage: pnpm plan:eval [filter...] [--runs N], N a whole number of at least 1"]);
}
const filters = args
  .filter((_, index) => runsFlag === -1 || (index !== runsFlag && index !== runsFlag + 1))
  .map((filter) => filter.toLowerCase());

let calls: LlmCall[] = [];
const allCalls: LlmCall[] = [];
const evaluator = valueOf(
  createPlanningEvaluator({
    onCall: (call) => {
      calls.push(call);
      allCalls.push(call);
    },
  }),
);
const evalSet = valueOf(loadPlanningEvalSet());
const selected = (...texts: string[]) =>
  filters.length === 0 ||
  filters.some((filter) => texts.some((text) => text.toLowerCase().includes(filter)));
const routes = evalSet.routes.filter(({ id, message }) => selected(id, message));
const plans = evalSet.plans.filter(({ id, message }) => selected(id, message));
if (routes.length === 0 && plans.length === 0) {
  fail([`No planning eval case matches ${filters.join(", ")}`]);
}

const inStock = new Map(evaluator.products.map(({ productId, inStock }) => [productId, inStock]));
const isLive = (productId: string) => inStock.get(productId) === true;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const costOf = (spent: LlmCall[]) => spent.reduce((total, call) => total + call.costUsd, 0);

const startedAt = new Date();
const routeRecords: RouteCaseRecord[] = [];
for (const routeCase of routes) {
  const runs: RouteCaseRunRecord[] = [];
  for (let run = 1; run <= runsPerCase; run += 1) {
    calls = [];
    const started = Date.now();
    let record: RouteCaseRunRecord;
    try {
      const topic = await evaluator.routeMessage(routeCase.message);
      record = {
        error: null,
        topic,
        score: scoreRoute(routeCase, topic),
        durationMs: 0,
        costUsd: 0,
      };
    } catch (error) {
      record = { error: errorText(error), topic: null, score: null, durationMs: 0, costUsd: 0 };
    }
    runs.push({ ...record, durationMs: Date.now() - started, costUsd: costOf(calls) });
    console.error(`${routeCase.id} run ${String(run)}: ${outcome(record)}`);
  }
  routeRecords.push({
    id: routeCase.id,
    message: routeCase.message,
    expectedToFail: routeCase.expectedToFail ?? null,
    passed: casePassed(runs.map(scoredRunOf)),
    runs,
  });
}

const planRecords: PlanCaseRecord[] = [];
for (const planCase of plans) {
  const runs: PlanCaseRunRecord[] = [];
  for (let run = 1; run <= runsPerCase; run += 1) {
    calls = [];
    const started = Date.now();
    let record: Omit<PlanCaseRunRecord, "judgment" | "sessions" | "durationMs" | "costUsd">;
    try {
      const result = await evaluator.planFirstMessage(planCase.message);
      record = { error: null, result, score: scorePlanRun(planCase, result, isLive) };
    } catch (error) {
      record = { error: errorText(error), result: null, score: null };
    }
    const sessions = calls.length;
    const durationMs = Date.now() - started;
    const costUsd = costOf(calls);
    let judgment: Judgment | null = null;
    if (record.result !== null) {
      try {
        judgment = await evaluator.judgeIdea({
          request: planCase.message,
          message: record.result.message,
          plan: record.result.plan,
        });
      } catch (error) {
        console.error(`${planCase.id} run ${String(run)}: judge failed: ${errorText(error)}`);
      }
    }
    runs.push({ ...record, judgment, sessions, durationMs, costUsd });
    console.error(`${planCase.id} run ${String(run)}: ${outcome(record)}`);
  }
  planRecords.push({
    id: planCase.id,
    message: planCase.message,
    expectedToFail: planCase.expectedToFail ?? null,
    passed: casePassed(runs.map(scoredRunOf)),
    runs,
  });
}

const stale = planningEvalSetIds({ routes, plans }).flatMap(({ caseId, ids }) =>
  ids.flatMap((productId): PlanningEvalRun["stale"] => {
    const stock = inStock.get(productId);
    if (stock === true) return [];
    return [{ caseId, productId, reason: stock === false ? "out of stock" : "missing" }];
  }),
);

const totals = summarizePlanning(routeRecords, planRecords);
const evalRun: PlanningEvalRun = {
  startedAt: startedAt.toISOString(),
  snapshotFetchedAt: evaluator.snapshotFetchedAt,
  models: [
    ...new Set(
      allCalls.map(({ task, model, effort }) => `${task} ${model}${effort ? ` ${effort}` : ""}`),
    ),
  ].sort(),
  runsPerCase,
  filters,
  durationMs: Date.now() - startedAt.getTime(),
  costUsd: costOf(allCalls),
  sessions: allCalls.length,
  stale,
  totals,
  routes: routeRecords,
  plans: planRecords,
};
const runPath = savePlanningEvalRun(evalRun);

console.log(formatPlanningReport(evalRun));
console.log(`Saved ${runPath}`);

if (totals.unexpectedFailures.length > 0) process.exit(1);

function scoredRunOf({ error, score }: { error: string | null; score: Score | null }): ScoredRun {
  return error === null && score !== null ? { error: null, score } : { error: error ?? "no score" };
}

function outcome({ error, score }: { error: string | null; score: Score | null }): string {
  return error ?? (score?.passed ? "passed" : "failed");
}
