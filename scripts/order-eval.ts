import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  DEFAULT_MODEL,
  createClaudeCodeLlm,
  type LlmCall,
} from "../src/order-resolution/claude-code-llm.ts";
import { evalSetSchema, scoreCase, validateEvalSet } from "../src/order-resolution/eval-set.ts";
import {
  createOrderResolver,
  type OrderResolution,
} from "../src/order-resolution/resolve-order.ts";
import { readJson, writeJsonText } from "./seed-files.ts";
import {
  ORDER_EVAL_RUNS_DIR,
  ORDER_EVAL_SET_PATH,
  PROMPTS_DIR,
  readOrderData,
  renderItem,
} from "./order-files.ts";

type Outcome = "hit" | "miss" | "error";

type CaseRun = {
  id: string;
  order: string;
  expectedToFail: string | null;
  outcome: Outcome;
  problems: string[];
  error: string | null;
  items: OrderResolution["items"];
  sessions: number;
  durationMs: number;
  costUsd: number;
};

const previousRunSchema = z.object({
  startedAt: z.string(),
  cases: z.array(z.object({ id: z.string(), outcome: z.enum(["hit", "miss", "error"]) })),
});

const filters = process.argv.slice(2).map((filter) => filter.toLowerCase());

const { products, vocabulary, mapping } = readOrderData();
const rawEvalSet = readJson(ORDER_EVAL_SET_PATH);
const validation = validateEvalSet(rawEvalSet, vocabulary);
if (validation.length > 0) {
  for (const error of validation) console.error(error);
  process.exit(1);
}
const cases = evalSetSchema
  .parse(rawEvalSet)
  .cases.filter(
    (evalCase) =>
      filters.length === 0 ||
      filters.some(
        (filter) =>
          evalCase.id.toLowerCase().includes(filter) ||
          evalCase.order.toLowerCase().includes(filter),
      ),
  );
if (cases.length === 0) {
  console.error(`No eval case matches ${filters.join(", ")}`);
  process.exit(1);
}

let calls: LlmCall[] = [];
const llm = createClaudeCodeLlm({
  vocabulary,
  promptsDir: PROMPTS_DIR,
  onCall: (call) => calls.push(call),
});
const { resolveOrder } = createOrderResolver({ products, vocabulary, mapping, llm });

const startedAt = new Date();
const runs: CaseRun[] = [];
for (const evalCase of cases) {
  calls = [];
  const started = Date.now();
  let run: Pick<CaseRun, "outcome" | "problems" | "error" | "items">;
  try {
    const resolution = await resolveOrder(evalCase.order);
    const { hit, problems } = scoreCase(evalCase, resolution, vocabulary);
    run = { outcome: hit ? "hit" : "miss", problems, error: null, items: resolution.items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    run = { outcome: "error", problems: [], error: message, items: [] };
  }
  runs.push({
    id: evalCase.id,
    order: evalCase.order,
    expectedToFail: evalCase.expectedToFail ?? null,
    ...run,
    sessions: calls.length,
    durationMs: Date.now() - started,
    costUsd: calls.reduce((total, call) => total + call.costUsd, 0),
  });
  console.error(`${evalCase.id}: ${run.outcome}`);
}

const durationMs = Date.now() - startedAt.getTime();
const costUsd = runs.reduce((total, run) => total + run.costUsd, 0);
const sessions = runs.reduce((total, run) => total + run.sessions, 0);
const previous = latestRun();

mkdirSync(ORDER_EVAL_RUNS_DIR, { recursive: true });
const runPath = join(ORDER_EVAL_RUNS_DIR, `${startedAt.toISOString().replaceAll(":", "-")}.json`);
writeFileSync(
  runPath,
  writeJsonText({
    startedAt: startedAt.toISOString(),
    model: DEFAULT_MODEL,
    filters,
    durationMs,
    costUsd,
    sessions,
    cases: runs,
  }),
);

const count = (outcome: Outcome, expectedToFail: boolean) =>
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
  `${sessions} Claude Code sessions on ${DEFAULT_MODEL}, ${(durationMs / 1000).toFixed(1)} s, US$ ${costUsd.toFixed(4)}`,
);
console.log(`Saved ${runPath}`);

if (count("miss", false) + count("error", false) > 0) process.exit(1);

function latestRun() {
  if (!existsSync(ORDER_EVAL_RUNS_DIR)) return null;
  const [latest] = readdirSync(ORDER_EVAL_RUNS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .reverse();
  return latest ? previousRunSchema.parse(readJson(join(ORDER_EVAL_RUNS_DIR, latest))) : null;
}
