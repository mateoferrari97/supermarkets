import type { PlanningEvalRun } from "../core/planning/eval-run.ts";
import { pesos, type PlanRun } from "../core/planning/eval-score.ts";

type CaseCost = {
  id: string;
  passed: boolean;
  runs: { durationMs: number; costUsd: number; sessions?: number }[];
};

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const dollars = (usd: number): string => `$${usd.toFixed(4)}`;

export function formatPlanningReport(run: PlanningEvalRun): string {
  const { totals } = run;
  const expectedToFail = run.plans.filter(({ expectedToFail }) => expectedToFail !== null);
  const judged = run.plans.flatMap(({ id, runs }) =>
    runs.flatMap(({ judgment }, index) => (judgment ? [{ id, run: index + 1, judgment }] : [])),
  );
  const notSensible = judged.filter(({ judgment }) => !judgment.sensible);
  const lines = [
    `# Planning eval, ${run.startedAt}`,
    "",
    `Catalog Snapshot of ${run.snapshotFetchedAt ?? "unknown date"}, ${String(run.runsPerCase)} runs per case.`,
    "",
    `- Routing cases passed: ${count(totals.routes)}`,
    `- Plan cases passed: ${count(totals.plans)}, ${String(expectedToFail.length)} expected to fail`,
    `- Errors: ${String(totals.errors.hits)} of ${String(totals.errors.total)} runs`,
    `- Ideas judged sensible, reported apart and never failing a run: ${count(totals.sensibleIdeas)}`,
    ...(run.stale.length === 0
      ? []
      : [
          `- Stale productIds: ${run.stale
            .map(({ caseId, productId, reason }) => `${caseId} ${productId} (${reason})`)
            .join(", ")}`,
        ]),
    "",
    "## Time and cost per case",
    "",
    "| Case | Passed | Sessions | Time per run | Cost per run | Cost |",
    "| --- | --- | --- | --- | --- | --- |",
    ...[...run.routes, ...run.plans].map(costRow),
    "",
  ];
  for (const failed of [...run.routes, ...run.plans].filter(({ passed }) => !passed)) {
    const expected = failed.expectedToFail ? ` (expected to fail: ${failed.expectedToFail})` : "";
    lines.push(`## Failed: ${failed.id}${expected}`, "", `"${failed.message}"`, "");
    for (const [index, caseRun] of failed.runs.entries()) {
      lines.push(`Run ${String(index + 1)}:`);
      if (caseRun.error !== null) lines.push(`- error: ${caseRun.error}`);
      for (const problem of caseRun.score?.problems ?? []) lines.push(`- ${problem}`);
      if ("result" in caseRun && caseRun.result !== null)
        lines.push(...describePlan(caseRun.result));
    }
    lines.push("");
  }
  if (notSensible.length > 0) {
    lines.push("## Judged not sensible", "");
    for (const { id, run: number, judgment } of notSensible) {
      lines.push(`- ${id} run ${String(number)}: ${judgment.reason}`);
    }
    lines.push("");
  }
  lines.push(
    `Models: ${run.models.join(", ")}`,
    `Sessions: ${String(run.sessions)}; time: ${seconds(run.durationMs)}; cost: ${dollars(run.costUsd)}`,
  );
  return lines.join("\n");
}

function count({ hits, total }: { hits: number; total: number }): string {
  return `${String(hits)}/${String(total)}`;
}

function costRow({ id, passed, runs }: CaseCost): string {
  const total = (pick: (run: CaseCost["runs"][number]) => number) =>
    runs.reduce((sum, run) => sum + pick(run), 0);
  const perRun = (value: number) => (runs.length === 0 ? 0 : value / runs.length);
  const sessions = runs.every(({ sessions }) => sessions === undefined)
    ? "-"
    : String(total(({ sessions }) => sessions ?? 0));
  const cost = total(({ costUsd }) => costUsd);
  return `| ${id} | ${passed ? "yes" : "no"} | ${sessions} | ${seconds(perRun(total(({ durationMs }) => durationMs)))} | ${dollars(perRun(cost))} | ${dollars(cost)} |`;
}

function describePlan({ plan, message, overBudget }: PlanRun): string[] {
  if (plan === null) return [`  - no Plan; message: ${message ?? "none"}`];
  const over = overBudget === null ? "" : `, over the budget by ${pesos(overBudget)}`;
  return [
    `  - ${plan.title}, total ${pesos(plan.total)}${over}`,
    ...plan.lines.map(
      ({ productId, name, sale, quantity, purpose }) =>
        `  - ${name} (${productId}): ${String(quantity)} ${sale.kind === "by-weight" ? "g" : "u"}, ${purpose}`,
    ),
  ];
}
