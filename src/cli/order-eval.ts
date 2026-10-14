import {
  createOrderResolver,
  loadEvalSet,
  loadLatestEvalRun,
  saveEvalRun,
  type LlmCall,
} from "../compose.ts";
import {
  runEvalCase,
  type EvalCaseRun,
  type EvalOutcome,
} from "../core/order-resolution/eval-run.ts";
import { renderItem } from "./render-item.ts";
import { fail, valueOf } from "./report.ts";

const filters = process.argv.slice(2).map((filter) => filter.toLowerCase());

let calls: LlmCall[] = [];
const { resolveOrder, model } = valueOf(
  createOrderResolver({ onCall: (call) => calls.push(call) }),
);
const { evalSet, vocabulary } = valueOf(loadEvalSet());
const cases = evalSet.cases.filter(
  (evalCase) =>
    filters.length === 0 ||
    filters.some(
      (filter) =>
        evalCase.id.toLowerCase().includes(filter) || evalCase.order.toLowerCase().includes(filter),
    ),
);
if (cases.length === 0) fail([`No eval case matches ${filters.join(", ")}`]);

const startedAt = new Date();
const runs: EvalCaseRun[] = [];
for (const evalCase of cases) {
  calls = [];
  const started = Date.now();
  const result = await runEvalCase(evalCase, resolveOrder, vocabulary);
  runs.push({
    id: evalCase.id,
    order: evalCase.order,
    expectedToFail: evalCase.expectedToFail ?? null,
    ...result,
    sessions: calls.length,
    durationMs: Date.now() - started,
    costUsd: calls.reduce((total, call) => total + call.costUsd, 0),
  });
  console.error(`${evalCase.id}: ${result.outcome}`);
}

const durationMs = Date.now() - startedAt.getTime();
const costUsd = runs.reduce((total, run) => total + run.costUsd, 0);
const sessions = runs.reduce((total, run) => total + run.sessions, 0);
const previous = loadLatestEvalRun();

const runPath = saveEvalRun({
  startedAt: startedAt.toISOString(),
  model,
  filters,
  durationMs,
  costUsd,
  sessions,
  cases: runs,
});

const count = (outcome: EvalOutcome, expectedToFail: boolean) =>
  runs.filter((run) => run.outcome === outcome && (run.expectedToFail !== null) === expectedToFail)
    .length;
const expectedMisses = runs.filter((run) => run.expectedToFail !== null && run.outcome !== "hit");

console.log(
  `# Order resolution eval, ${startedAt.toISOString()}\n\n` +
    `${count("hit", false) + count("hit", true)}/${runs.length} hits, ` +
    `${count("miss", false)} misses, ${count("error", false)} errors, ` +
    `${expectedMisses.length} expected to fail\n`,
);

for (const run of runs.filter((run) => run.outcome !== "hit")) {
  const label = run.outcome === "error" ? "Error" : "Miss";
  const expected = run.expectedToFail ? ` (expected to fail: ${run.expectedToFail})` : "";
  console.log(`## ${label}: ${run.id}${expected}\n\n"${run.order}"\n`);
  if (run.error) console.log(`${run.error}\n`);
  for (const problem of run.problems) console.log(`- ${problem}`);
  if (run.items.length > 0) {
    console.log("\nCame back:\n");
    for (const item of run.items) console.log(`- ${renderItem(item)}`);
  }
  console.log("");
}

const unexpectedHits = runs.filter((run) => run.expectedToFail !== null && run.outcome === "hit");
if (unexpectedHits.length > 0) {
  console.log(
    `Expected to fail but hit: ${unexpectedHits.map(({ id }) => id).join(", ")}; clear expectedToFail.\n`,
  );
}

if (previous) {
  const before = new Map(previous.cases.map((run) => [run.id, run.outcome]));
  const changes = runs.flatMap((run) => {
    const old = before.get(run.id);
    return old && old !== run.outcome ? [`${run.id} ${old} → ${run.outcome}`] : [];
  });
  console.log(
    `Since ${previous.startedAt}: ${changes.length > 0 ? changes.join(", ") : "no outcome changed"}\n`,
  );
}

console.log(
  `${sessions} Claude Code sessions on ${model}, ${(durationMs / 1000).toFixed(1)} s, US$ ${costUsd.toFixed(4)}`,
);
console.log(`Saved ${runPath}`);

if (count("miss", false) + count("error", false) > 0) process.exit(1);
