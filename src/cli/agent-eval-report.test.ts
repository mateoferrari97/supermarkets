import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { AgentEvalRun, AgentRun } from "../core/agent-chat/eval-run.ts";
import { formatAgentReport } from "./agent-eval-report.ts";

const run: AgentRun = {
  turns: [
    {
      owner: "2 leches",
      reply: { role: "assistant", at: "2026-10-16T12:00:00.000Z", text: "Armé este pedido:\n1. x" },
      ends: "proposal",
      calls: [
        { name: "resolveItem", input: {}, output: { kind: "picked" }, error: null },
        { name: "updateProfile", input: {}, output: null, error: "boom" },
      ],
      profileBefore: { postalCode: "1425" },
      durationMs: 1000,
    },
  ],
  profile: { postalCode: "1425" },
  carts: [],
};

const evalRun: AgentEvalRun = {
  startedAt: "2026-10-16T21:00:00.000Z",
  snapshotFetchedAt: "2026-10-15T20:44:49.211Z",
  models: ["fit-products claude-sonnet-5-5"],
  runsPerCase: 2,
  filters: [],
  durationMs: 65000,
  costUsd: 0.5,
  sessions: 6,
  stale: [{ caseId: "repeat", productId: "9", reason: "out of stock" }],
  totals: { cases: { hits: 1, total: 2 }, errors: { hits: 1, total: 4 } },
  unexpectedFailures: ["add"],
  cases: [
    {
      id: "precise",
      expectedToFail: null,
      passed: true,
      runs: [
        { error: null, run, problems: [], durationMs: 2000, costUsd: 0.01 },
        { error: null, run, problems: [], durationMs: 4000, costUsd: 0.03 },
      ],
    },
    {
      id: "add",
      expectedToFail: null,
      passed: false,
      runs: [
        {
          error: null,
          run,
          problems: ["turn 1: ended with text, expected proposal"],
          durationMs: 3000,
          costUsd: 0,
        },
        {
          error: "The agent answered with no text.",
          run: null,
          problems: [],
          durationMs: 1000,
          costUsd: 0,
        },
      ],
    },
  ],
};

describe("formatAgentReport", () => {
  const report = formatAgentReport(evalRun);

  it("starts with the totals and the stale ids", () => {
    assert.match(report, /^# Agent eval, 2026-10-16T21:00:00.000Z/);
    assert.match(report, /Catalog Snapshot of 2026-10-15T20:44:49.211Z, 2 runs per case\./);
    assert.match(report, /- Cases passed: 1\/2, 0 expected to fail/);
    assert.match(report, /- Errors: 1 of 4 runs/);
    assert.match(report, /- Stale productIds: repeat 9 \(out of stock\)/);
  });

  it("has a row of time and cost per case, per run and in total", () => {
    assert.match(report, /\| precise \| yes \| 3\.0 s \| \$0\.0200 \| \$0\.0400 \|/);
    assert.match(report, /\| add \| no \| 2\.0 s \| \$0\.0000 \| \$0\.0000 \|/);
  });

  it("describes each failed run with its problems or error and what the agent did", () => {
    assert.match(report, /## Failed: add\n/);
    assert.doesNotMatch(report, /## Failed: precise/);
    assert.match(report, /- turn 1: ended with text, expected proposal/);
    assert.match(report, /- error: The agent answered with no text\./);
    assert.match(report, /turn 1, Owner: "2 leches"/);
    assert.match(report, /tools: resolveItem \(picked\), updateProfile/);
    assert.match(report, /ended with proposal: Armé este pedido:/);
  });

  it("ends with the models, the sessions and a note that the agent is not costed", () => {
    assert.match(report, /Models: fit-products claude-sonnet-5-5/);
    assert.match(
      report,
      /Sessions of the order matching calls: 6; time: 65\.0 s; cost of those calls: \$0\.5000/,
    );
    assert.match(report, /the agent's own sessions are not costed/);
  });

  it("notes a case expected to fail", () => {
    const expected = formatAgentReport({
      ...evalRun,
      cases: evalRun.cases.map((each) =>
        each.id === "add" ? { ...each, expectedToFail: "known" } : each,
      ),
    });
    assert.match(expected, /## Failed: add \(expected to fail: known\)/);
    assert.match(expected, /- Cases passed: 1\/2, 1 expected to fail/);
  });
});
