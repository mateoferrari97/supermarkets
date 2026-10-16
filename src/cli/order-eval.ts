import {
  createOrderMatcher,
  loadEvalSet,
  loadLatestEvalRun,
  saveEvalRun,
  type LlmCall,
} from "../compose.ts";
import {
  answerCasePassed,
  replyInputOf,
  scoreAnswer,
  unexpectedAnswerFailures,
  type AnswerCaseRuns,
  type AnswerRun,
} from "../core/order-matching/eval-answers.ts";
import {
  orderRunOf,
  type AnswerCaseRecord,
  type AnswerCaseRunRecord,
  type EvalCaseRecord,
  type EvalCaseRunRecord,
} from "../core/order-matching/eval-run.ts";
import {
  casePassed,
  changesSince,
  scoreRun,
  summarize,
  unexpectedFailures,
  type CaseRuns,
  type ScoredRun,
} from "../core/order-matching/eval-score.ts";
import { staleIds } from "../core/order-matching/eval-set.ts";
import { formatReport } from "./eval-report.ts";
import { fail, valueOf } from "./report.ts";

const args = process.argv.slice(2);
const runsFlag = args.indexOf("--runs");
const runsPerCase = runsFlag === -1 ? 3 : Number(args[runsFlag + 1]);
if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
  fail(["Usage: pnpm order:eval [filter...] [--runs N], N a whole number of at least 1"]);
}
const filters = args
  .filter((_, index) => runsFlag === -1 || (index !== runsFlag && index !== runsFlag + 1))
  .map((filter) => filter.toLowerCase());

let calls: LlmCall[] = [];
const allCalls: LlmCall[] = [];
const matcher = valueOf(
  createOrderMatcher({
    onCall: (call) => {
      calls.push(call);
      allCalls.push(call);
    },
  }),
);
const evalSet = valueOf(loadEvalSet());
const selected = (...texts: string[]) =>
  filters.length === 0 ||
  filters.some((filter) => texts.some((text) => text.toLowerCase().includes(filter)));
const cases = evalSet.cases.filter((evalCase) => selected(evalCase.id, evalCase.order));
const answerCases = (evalSet.answers ?? []).filter((answerCase) =>
  selected(answerCase.id, answerCase.reply),
);
if (cases.length === 0 && answerCases.length === 0) {
  fail([`No eval case matches ${filters.join(", ")}`]);
}

const inStock = new Map(matcher.products.map(({ productId, inStock }) => [productId, inStock]));
const isLive = (productId: string) => inStock.get(productId) === true;
const byId = new Map(matcher.products.map((product) => [product.productId, product]));
const names = new Map(matcher.products.map(({ productId, name }) => [productId, name]));
const nameOf = (productId: string) => `${names.get(productId) ?? "unknown"} (${productId})`;

const startedAt = new Date();
const caseRuns: CaseRuns[] = [];
const records: EvalCaseRecord[] = [];
for (const evalCase of cases) {
  const runs: ScoredRun[] = [];
  const runRecords: EvalCaseRunRecord[] = [];
  for (let run = 1; run <= runsPerCase; run += 1) {
    calls = [];
    const started = Date.now();
    let scored: ScoredRun;
    try {
      const result = await orderRunOf(await matcher.matchOrder(evalCase.order));
      scored = { error: null, result, score: scoreRun(evalCase, result, isLive) };
    } catch (error) {
      scored = { error: error instanceof Error ? error.message : String(error) };
    }
    runs.push(scored);
    runRecords.push({
      error: scored.error,
      result: scored.error === null ? scored.result : null,
      score: scored.error === null ? scored.score : null,
      sessions: calls.length,
      durationMs: Date.now() - started,
      costUsd: calls.reduce((total, call) => total + call.costUsd, 0),
    });
    const outcome = scored.error ?? (scored.score.passed ? "passed" : "failed");
    console.error(`${evalCase.id} run ${String(run)}: ${outcome}`);
  }
  caseRuns.push({ evalCase, runs });
  records.push({
    id: evalCase.id,
    order: evalCase.order,
    expectedToFail: evalCase.expectedToFail ?? null,
    passed: casePassed({ evalCase, runs }),
    runs: runRecords,
  });
}

const answerRuns: AnswerCaseRuns[] = [];
const answerRecords: AnswerCaseRecord[] = [];
for (const answerCase of answerCases) {
  const runs: AnswerRun[] = [];
  const runRecords: AnswerCaseRunRecord[] = [];
  for (let run = 1; run <= runsPerCase; run += 1) {
    calls = [];
    const started = Date.now();
    let scored: AnswerRun;
    try {
      const output = await matcher.readReply(
        replyInputOf(answerCase, (productId) => byId.get(productId)),
      );
      scored = { error: null, output, score: scoreAnswer(answerCase, output) };
    } catch (error) {
      scored = { error: error instanceof Error ? error.message : String(error) };
    }
    runs.push(scored);
    runRecords.push({
      error: scored.error,
      output: scored.error === null ? scored.output : null,
      score: scored.error === null ? scored.score : null,
      durationMs: Date.now() - started,
      costUsd: calls.reduce((total, call) => total + call.costUsd, 0),
    });
    const outcome = scored.error ?? (scored.score.passed ? "passed" : "failed");
    console.error(`${answerCase.id} run ${String(run)}: ${outcome}`);
  }
  answerRuns.push({ answerCase, runs });
  answerRecords.push({
    id: answerCase.id,
    reply: answerCase.reply,
    expectedToFail: answerCase.expectedToFail ?? null,
    passed: answerCasePassed({ answerCase, runs }),
    runs: runRecords,
  });
}

const previous = loadLatestEvalRun();
const evalRun = {
  startedAt: startedAt.toISOString(),
  snapshotFetchedAt: matcher.snapshotFetchedAt,
  models: [
    ...new Set(
      allCalls.map(({ task, model, effort }) => `${task} ${model}${effort ? ` ${effort}` : ""}`),
    ),
  ].sort(),
  runsPerCase,
  filters,
  durationMs: Date.now() - startedAt.getTime(),
  costUsd: allCalls.reduce((total, call) => total + call.costUsd, 0),
  sessions: allCalls.length,
  stale: staleIds({ cases, answers: answerCases }, inStock),
  totals: summarize(caseRuns),
  cases: records,
  answers: answerRecords,
};
const runPath = saveEvalRun(evalRun);

console.log(
  formatReport(
    evalRun,
    nameOf,
    previous && {
      startedAt: previous.startedAt,
      changes: changesSince(previous.cases, records),
    },
  ),
);
console.log(`Saved ${runPath}`);

if (unexpectedFailures(caseRuns).length > 0 || unexpectedAnswerFailures(answerRuns).length > 0) {
  process.exit(1);
}
