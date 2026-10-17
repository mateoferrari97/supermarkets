import {
  createAgentEvaluator,
  loadAgentEvalSet,
  saveAgentEvalRun,
  type LlmCall,
} from "../compose.ts";
import type {
  AgentCaseRecord,
  AgentCaseRunRecord,
  AgentEvalRun,
} from "../core/agent-chat/eval-run.ts";
import { scoreAgentRun } from "../core/agent-chat/eval-score.ts";
import { staleIds } from "../core/agent-chat/eval-set.ts";
import { formatAgentReport } from "./agent-eval-report.ts";
import { fail, valueOf } from "./report.ts";

const args = process.argv.slice(2);
const runsFlag = args.indexOf("--runs");
const runsPerCase = runsFlag === -1 ? 3 : Number(args[runsFlag + 1]);
if (!Number.isInteger(runsPerCase) || runsPerCase < 1) {
  fail(["Usage: pnpm agent:eval [filter...] [--runs N], N a whole number of at least 1"]);
}
const filters = args
  .filter((_, index) => runsFlag === -1 || (index !== runsFlag && index !== runsFlag + 1))
  .map((filter) => filter.toLowerCase());

let calls: LlmCall[] = [];
const allCalls: LlmCall[] = [];
const evaluator = valueOf(
  createAgentEvaluator({
    onCall: (call) => {
      calls.push(call);
      allCalls.push(call);
    },
  }),
);
const evalSet = valueOf(loadAgentEvalSet());
const selected = evalSet.cases.filter(
  ({ id, turns }) =>
    filters.length === 0 ||
    filters.some(
      (filter) =>
        id.toLowerCase().includes(filter) ||
        turns.some(({ owner }) => owner.toLowerCase().includes(filter)),
    ),
);
if (selected.length === 0) fail([`No agent eval case matches ${filters.join(", ")}`]);

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
const costOf = (spent: LlmCall[]) => spent.reduce((total, call) => total + call.costUsd, 0);

const startedAt = new Date();
const records: AgentCaseRecord[] = [];
for (const evalCase of selected) {
  const runs: AgentCaseRunRecord[] = [];
  for (let number = 1; number <= runsPerCase; number += 1) {
    calls = [];
    const started = Date.now();
    let record: Pick<AgentCaseRunRecord, "error" | "run" | "problems">;
    try {
      const run = await evaluator.runCase(evalCase);
      record = { error: null, run, problems: scoreAgentRun(evalCase, run).problems };
    } catch (error) {
      record = { error: errorText(error), run: null, problems: [] };
    }
    runs.push({ ...record, durationMs: Date.now() - started, costUsd: costOf(calls) });
    console.error(
      `${evalCase.id} run ${String(number)}: ${record.error ?? (record.problems.length === 0 ? "passed" : "failed")}`,
    );
    for (const problem of record.problems) console.error(`  - ${problem}`);
  }
  records.push({
    id: evalCase.id,
    expectedToFail: evalCase.expectedToFail ?? null,
    passed: runs.every(({ error, problems }) => error === null && problems.length === 0),
    runs,
  });
}

const inStock = new Map(evaluator.products.map(({ productId, inStock }) => [productId, inStock]));
const failures = records.filter(({ passed, expectedToFail }) => !passed && expectedToFail === null);
const allRuns = records.flatMap(({ runs }) => runs);
const evalRun: AgentEvalRun = {
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
  stale: staleIds({ cases: selected }, inStock),
  totals: {
    cases: { hits: records.filter(({ passed }) => passed).length, total: records.length },
    errors: { hits: allRuns.filter(({ error }) => error !== null).length, total: allRuns.length },
  },
  unexpectedFailures: failures.map(({ id }) => id),
  cases: records,
};
const runPath = saveAgentEvalRun(evalRun);

console.log(formatAgentReport(evalRun));
console.log(`Saved ${runPath}`);

if (failures.length > 0) process.exit(1);
