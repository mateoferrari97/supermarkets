import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { PlanningEvalRun } from "../core/planning/eval-run.ts";
import { formatPlanningReport } from "./plan-eval-report.ts";

const run: PlanningEvalRun = {
  startedAt: "2026-10-16T21:00:00.000Z",
  snapshotFetchedAt: "2026-10-15T20:44:49.211Z",
  models: ["plan claude-sonnet-5-5", "route-message claude-haiku-5-5"],
  runsPerCase: 2,
  filters: [],
  durationMs: 65000,
  costUsd: 1.2345,
  sessions: 7,
  stale: [{ caseId: "asado", productId: "9", reason: "out of stock" }],
  totals: {
    routes: { hits: 1, total: 1 },
    plans: { hits: 0, total: 1 },
    unexpectedFailures: ["asado"],
    errors: { hits: 1, total: 4 },
    sensibleIdeas: { hits: 0, total: 1 },
  },
  routes: [
    {
      id: "leche",
      message: "2 leches",
      expectedToFail: null,
      passed: true,
      runs: [
        {
          error: null,
          topic: "order",
          score: { passed: true, problems: [] },
          durationMs: 1500,
          costUsd: 0.01,
        },
        {
          error: null,
          topic: "order",
          score: { passed: true, problems: [] },
          durationMs: 2500,
          costUsd: 0.01,
        },
      ],
    },
  ],
  plans: [
    {
      id: "asado",
      message: "un asado para 10",
      expectedToFail: null,
      passed: false,
      runs: [
        {
          error: null,
          result: {
            message: "Te armé un asado.",
            plan: {
              title: "Asado para 10",
              idea: [{ heading: "Pasos", text: "Prendé el fuego" }],
              lines: [
                {
                  productId: "1",
                  name: "Asado x kg",
                  sale: { kind: "by-weight", saleStepKg: 1.2 },
                  quantity: 2400,
                  purpose: "para el asado",
                  total: 28800,
                },
              ],
              total: 28800,
            },
            budget: 20000,
            overBudget: 8800,
            repeatedProductIds: [],
            searches: [["asado"]],
          },
          score: { passed: false, problems: ["total $28800 is over the budget of $20000"] },
          judgment: { sensible: false, reason: "Too little meat for 10." },
          sessions: 4,
          durationMs: 40000,
          costUsd: 0.6,
        },
        {
          error: "plan answer breaks a rule: boom",
          result: null,
          score: null,
          judgment: null,
          sessions: 1,
          durationMs: 20000,
          costUsd: 0.6,
        },
      ],
    },
  ],
};

describe("formatPlanningReport", () => {
  it("prints the totals, time and cost per case, failures and the judge apart", () => {
    assert.equal(
      formatPlanningReport(run),
      [
        "# Planning eval, 2026-10-16T21:00:00.000Z",
        "",
        "Catalog Snapshot of 2026-10-15T20:44:49.211Z, 2 runs per case.",
        "",
        "- Routing cases passed: 1/1",
        "- Plan cases passed: 0/1, 0 expected to fail",
        "- Errors: 1 of 4 runs",
        "- Ideas judged sensible, reported apart and never failing a run: 0/1",
        "- Stale productIds: asado 9 (out of stock)",
        "",
        "## Time and cost per case",
        "",
        "| Case | Passed | Sessions | Time per run | Cost per run | Cost |",
        "| --- | --- | --- | --- | --- | --- |",
        "| leche | yes | - | 2.0 s | $0.0100 | $0.0200 |",
        "| asado | no | 5 | 30.0 s | $0.6000 | $1.2000 |",
        "",
        "## Failed: asado",
        "",
        '"un asado para 10"',
        "",
        "Run 1:",
        "- total $28800 is over the budget of $20000",
        "  - Asado para 10, total $28800, over the budget by $8800",
        "  - Asado x kg (1): 2400 g, para el asado",
        "Run 2:",
        "- error: plan answer breaks a rule: boom",
        "",
        "## Judged not sensible",
        "",
        "- asado run 1: Too little meat for 10.",
        "",
        "Models: plan claude-sonnet-5-5, route-message claude-haiku-5-5",
        "Sessions: 7; time: 65.0 s; cost: $1.2345",
      ].join("\n"),
    );
  });
});
