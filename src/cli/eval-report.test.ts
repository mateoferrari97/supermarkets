import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { EvalRun } from "../core/order-matching/eval-run.ts";
import { summarize } from "../core/order-matching/eval-score.ts";
import { formatReport } from "./eval-report.ts";

const run: EvalRun = {
  startedAt: "2026-10-15T21:00:00.000Z",
  snapshotFetchedAt: "2026-10-15T20:44:49.211Z",
  models: ["fit-products claude-sonnet-5-5", "parse-order claude-sonnet-5-5 low"],
  runsPerCase: 3,
  filters: [],
  durationMs: 12345,
  costUsd: 0.1234,
  sessions: 4,
  stale: [{ caseId: "coca", productId: "9", reason: "out of stock" }],
  totals: { ...summarize([]), cases: { hits: 1, total: 2 }, wrongPicksUnseen: 1, scoredItems: 3 },
  cases: [
    { id: "yerba", order: "una yerba", expectedToFail: null, passed: true, runs: [] },
    {
      id: "coca",
      order: "coca grande",
      expectedToFail: "call 2 keeps Pepsi",
      passed: false,
      runs: [
        {
          error: null,
          result: {
            ignoredPreference: false,
            items: [
              {
                item: {
                  original: "coca grande",
                  product: "Gaseosa cola",
                  brand: "Coca Cola",
                  size: { kind: "biggest" },
                  quantity: { kind: "minimum" },
                },
                matches: ["1", "2"],
                fits: ["2"],
                alternatives: [],
                note: "Tomé Pepsi",
                question: null,
                pick: { productId: "2", quantity: 1, notes: [] },
              },
            ],
          },
          score: null,
          sessions: 2,
          durationMs: 1,
          costUsd: 0,
        },
        { error: "timeout", result: null, score: null, sessions: 1, durationMs: 1, costUsd: 0 },
      ],
    },
  ],
};

describe("formatReport", () => {
  it("prints the totals, the failed cases with their runs, stale ids and changes", () => {
    const report = formatReport(run, (id) => `Producto ${id}`, {
      startedAt: "2026-10-14T21:00:00.000Z",
      changes: ["coca passed → failed"],
    });
    assert.match(report, /^# Order matching eval, 2026-10-15T21:00:00.000Z\n/);
    assert.match(report, /Catalog Snapshot of 2026-10-15T20:44:49.211Z, 3 runs per case\./);
    assert.match(report, /- Cases passed: 1\/2, 1 expected to fail/);
    assert.match(report, /- Wrong picks nobody sees: 1 of 3 Items scored/);
    assert.match(report, /- Matches recall: n\/a/);
    assert.match(report, /## Failed: coca \(expected to fail: call 2 keeps Pepsi\)/);
    assert.match(
      report,
      /coca grande → Gaseosa cola \[brand Coca Cola; size biggest; quantity \{"kind":"minimum"\}\]: 1 Fits of 2 Matches; picks 1 × Producto 2; notes: Tomé Pepsi/,
    );
    assert.match(report, /Run 2:\n- error: timeout/);
    assert.match(report, /- coca: 9 out of stock/);
    assert.match(report, /Since 2026-10-14T21:00:00.000Z: coca passed → failed/);
    assert.match(
      report,
      /4 Claude Code sessions on fit-products claude-sonnet-5-5, parse-order claude-sonnet-5-5 low, 12.3 s, US\$ 0.1234$/,
    );
    assert.doesNotMatch(report, /Failed: yerba/);
  });
});
