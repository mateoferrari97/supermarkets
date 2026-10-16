import type { AgentEvalRun, AgentCaseRecord, AgentRun } from "../core/agent-chat/eval-run.ts";

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const dollars = (usd: number): string => `$${usd.toFixed(4)}`;

const count = ({ hits, total }: { hits: number; total: number }): string =>
  `${String(hits)}/${String(total)}`;

export function formatAgentReport(run: AgentEvalRun): string {
  const { totals } = run;
  const expectedToFail = run.cases.filter(({ expectedToFail }) => expectedToFail !== null);
  const lines = [
    `# Agent eval, ${run.startedAt}`,
    "",
    `Catalog Snapshot of ${run.snapshotFetchedAt ?? "unknown date"}, ${String(run.runsPerCase)} runs per case.`,
    "",
    `- Cases passed: ${count(totals.cases)}, ${String(expectedToFail.length)} expected to fail`,
    `- Errors: ${String(totals.errors.hits)} of ${String(totals.errors.total)} runs`,
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
    "| Case | Passed | Time per run | Cost per run | Cost |",
    "| --- | --- | --- | --- | --- |",
    ...run.cases.map(costRow),
    "",
  ];
  for (const failed of run.cases.filter(({ passed }) => !passed)) {
    const expected = failed.expectedToFail ? ` (expected to fail: ${failed.expectedToFail})` : "";
    lines.push(`## Failed: ${failed.id}${expected}`, "");
    for (const [index, caseRun] of failed.runs.entries()) {
      lines.push(`Run ${String(index + 1)}:`);
      if (caseRun.error !== null) lines.push(`- error: ${caseRun.error}`);
      for (const problem of caseRun.problems) lines.push(`- ${problem}`);
      if (caseRun.run !== null) lines.push(...describeRun(caseRun.run));
    }
    lines.push("");
  }
  lines.push(
    `Models: ${run.models.join(", ")}`,
    `Sessions of the order matching calls: ${String(run.sessions)}; time: ${seconds(run.durationMs)}; cost of those calls: ${dollars(run.costUsd)} (the agent's own sessions are not costed)`,
  );
  return lines.join("\n");
}

function costRow({ id, passed, runs }: AgentCaseRecord): string {
  const total = (pick: (each: AgentCaseRecord["runs"][number]) => number) =>
    runs.reduce((sum, each) => sum + pick(each), 0);
  const perRun = (value: number) => (runs.length === 0 ? 0 : value / runs.length);
  const cost = total(({ costUsd }) => costUsd);
  return `| ${id} | ${passed ? "yes" : "no"} | ${seconds(perRun(total(({ durationMs }) => durationMs)))} | ${dollars(perRun(cost))} | ${dollars(cost)} |`;
}

function describeRun({ turns }: AgentRun): string[] {
  return turns.flatMap(({ owner, calls, ends, reply }, index) => [
    `  - turn ${String(index + 1)}, Owner: "${owner}"`,
    `    tools: ${calls.length === 0 ? "none" : calls.map(({ name, output }) => `${name}${kindOf(output)}`).join(", ")}`,
    `    ended with ${ends}: ${reply.text.split("\n")[0] ?? ""}`,
  ]);
}

function kindOf(output: unknown): string {
  return typeof output === "object" && output !== null && "kind" in output
    ? ` (${String(output.kind)})`
    : "";
}
