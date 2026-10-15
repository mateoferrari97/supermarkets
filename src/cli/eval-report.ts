import type { EvalRun } from "../core/order-matching/eval-run.ts";
import type { ItemRun, Ratio } from "../core/order-matching/eval-score.ts";

export type PreviousRun = { startedAt: string; changes: string[] };

const percent = ({ hits, total }: Ratio): string =>
  total === 0 ? "n/a" : `${((hits / total) * 100).toFixed(1)}% (${String(hits)}/${String(total)})`;

const count = ({ hits, total }: Ratio): string => `${String(hits)}/${String(total)}`;

export function formatReport(
  run: EvalRun,
  nameOf: (productId: string) => string,
  previous: PreviousRun | null,
): string {
  const { totals } = run;
  const expectedToFail = run.cases.filter(({ expectedToFail }) => expectedToFail !== null);
  const lines = [
    `# Order matching eval, ${run.startedAt}`,
    "",
    `Catalog Snapshot of ${run.snapshotFetchedAt ?? "unknown date"}, ${String(run.runsPerCase)} runs per case.`,
    "",
    `- Cases passed: ${count(totals.cases)}, ${String(expectedToFail.length)} expected to fail`,
    `- Wrong picks nobody sees: ${String(totals.wrongPicksUnseen)} of ${String(totals.scoredItems)} Items scored`,
    `- Items read right: ${percent(totals.itemsRead)}; number of Items right in ${count(totals.itemCountRight)} runs; no word that must not be an Item in ${count(totals.notItemsKept)} runs`,
    `- Matches recall: ${percent(totals.matchesRecall)}`,
    `- Fits precision: ${percent(totals.fitsPrecision)}; Fits recall: ${percent(totals.fitsRecall)}`,
    `- Pick right: ${percent(totals.pickRight)}`,
    `- Questions: ${String(totals.unexpectedQuestions)} asked when they should not, ${String(totals.missedQuestions)} not asked when they should`,
    `- Alternatives among the expected ones: ${percent(totals.alternatives)}`,
    `- ignoredPreference right: ${count(totals.ignoredPreference)}`,
    `- Stability, same Fits and pick in every run: ${percent(totals.stability)}`,
    `- Errors: ${String(totals.errors)} of ${String(totals.runs)} runs`,
    "",
  ];
  for (const evalCase of run.cases.filter(({ passed }) => !passed)) {
    const expected = evalCase.expectedToFail
      ? ` (expected to fail: ${evalCase.expectedToFail})`
      : "";
    lines.push(`## Failed: ${evalCase.id}${expected}`, "", `"${evalCase.order}"`, "");
    for (const [index, caseRun] of evalCase.runs.entries()) {
      lines.push(`Run ${String(index + 1)}:`);
      if (caseRun.error !== null) lines.push(`- error: ${caseRun.error}`);
      for (const problem of caseRun.score?.problems ?? []) lines.push(`- ${problem}`);
      for (const item of caseRun.result?.items ?? [])
        lines.push(`  - ${describeItem(item, nameOf)}`);
    }
    lines.push("");
  }
  const unexpectedPasses = expectedToFail.filter(({ passed }) => passed).map(({ id }) => id);
  if (unexpectedPasses.length > 0) {
    lines.push(
      `Expected to fail but passed: ${unexpectedPasses.join(", ")}; clear expectedToFail.`,
      "",
    );
  }
  if (run.stale.length > 0) {
    lines.push("Stale ids, to relabel:", "");
    for (const { caseId, productId, reason } of run.stale) {
      lines.push(`- ${caseId}: ${productId} ${reason}`);
    }
    lines.push("");
  }
  if (previous) {
    const changes = previous.changes.length > 0 ? previous.changes.join(", ") : "no case changed";
    lines.push(`Since ${previous.startedAt}: ${changes}`, "");
  }
  lines.push(
    `${String(run.sessions)} Claude Code sessions on ${run.models.join(", ")}, ` +
      `${(run.durationMs / 1000).toFixed(1)} s, US$ ${run.costUsd.toFixed(4)}`,
  );
  return lines.join("\n");
}

function describeItem(run: ItemRun, nameOf: (productId: string) => string): string {
  const read = `${run.item.original} → ${run.item.product} [brand ${run.item.brand ?? "none"}; size ${run.item.size.kind}; quantity ${JSON.stringify(run.item.quantity)}]`;
  const outcome =
    run.question !== null
      ? `asks "${run.question}" with ${run.alternatives.map(nameOf).join(", ") || "no Alternative"}`
      : run.pick === null
        ? "picks nothing"
        : `picks ${String(run.pick.quantity)} × ${nameOf(run.pick.productId)}`;
  const notes = [run.note, ...(run.pick?.notes ?? [])].filter((note) => note !== null);
  return `${read}: ${String(run.fits.length)} Fits of ${String(run.matches.length)} Matches; ${outcome}${notes.length > 0 ? `; notes: ${notes.join(" / ")}` : ""}`;
}
