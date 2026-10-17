import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { TurnLogEntry } from "../core/agent-chat/turn-log.ts";
import { formatTurn, formatTurns } from "./chat-turns-report.ts";

const base: TurnLogEntry = {
  startedAt: "2026-10-17T16:11:14.491Z",
  ownerText: "hola, ¿qué podés hacer?",
  durationMs: 3659.4,
  outcome: "replied",
  error: null,
  agent: { startMs: 0.3, endMs: 3658.8, reported: null },
  events: [],
};

const reported = {
  durationMs: 2388,
  costUsd: 0.080427,
  inputTokens: 2,
  outputTokens: 102,
  cacheReadTokens: 10535,
  cacheWriteTokens: 9534,
};

const resolved: TurnLogEntry = {
  startedAt: "2026-10-17T16:15:51.530Z",
  ownerText: "necesito una leche entera y dos yogures de frutilla, por favor, gracias",
  durationMs: 10190.3,
  outcome: "ended-by-tool",
  error: null,
  agent: { startMs: 0.3, endMs: 10190, reported: null },
  events: [
    {
      kind: "llm-call",
      task: "fit-products",
      model: "claude-sonnet-5-5",
      effort: "low",
      item: "leche entera",
      endMs: 6301.8,
      durationMs: 4080,
      costUsd: 0.0124,
    },
    {
      kind: "llm-call",
      task: "fit-products",
      model: "claude-sonnet-5-5",
      effort: "low",
      item: "yogur de frutilla",
      endMs: 5900,
      durationMs: 3600,
      costUsd: 0.0101,
    },
    {
      kind: "step",
      label: "Eligiendo productos para 'leche entera'",
      startMs: 1869.2,
      endMs: 6302.2,
    },
    {
      kind: "tool",
      name: "resolveItem",
      startMs: 1900,
      endMs: 6500,
      ok: true,
      error: null,
    },
    {
      kind: "tool",
      name: "resolveItem",
      startMs: 1868,
      endMs: 7022,
      ok: true,
      error: null,
    },
    {
      kind: "tool",
      name: "proposeOrder",
      startMs: 8168.5,
      endMs: 8185.5,
      ok: true,
      error: null,
    },
  ],
};

describe("formatTurn", () => {
  it("prints a reply with the agent's wall time and what its session reported", () => {
    assert.equal(
      formatTurn({ ...base, agent: { ...base.agent, reported } }),
      [
        '2026-10-17T16:11:14.491Z replied 3.7 s "hola, ¿qué podés hacer?"',
        "  agent 3.7 s wall, 2.4 s reported, $0.0804",
      ].join("\n"),
    );
  });

  it("says when the session was not reported, and when it reported no duration or cost", () => {
    assert.match(formatTurn(base), /agent 3\.7 s wall, session not reported$/);
    assert.match(
      formatTurn({
        ...base,
        agent: { ...base.agent, reported: { ...reported, durationMs: null, costUsd: null } },
      }),
      /agent 3\.7 s wall, no reported duration$/,
    );
  });

  it("prints overlapping tools by start and sums the fit-products calls", () => {
    assert.equal(
      formatTurn(resolved),
      [
        '2026-10-17T16:15:51.530Z ended-by-tool 10.2 s "necesito una leche entera y dos yogures…"',
        "  agent 10.2 s wall, session not reported",
        "  resolveItem 5.2 s (from 1.9 s to 7.0 s)",
        "  resolveItem 4.6 s (from 1.9 s to 6.5 s)",
        "  proposeOrder 0.0 s (from 8.2 s to 8.2 s)",
        "  fit-products 2 calls, 7.7 s, $0.0225",
      ].join("\n"),
    );
  });

  it("prints a failed turn with its error and a tool that failed", () => {
    assert.equal(
      formatTurn({
        ...base,
        outcome: "failed",
        error: "session failed",
        events: [
          {
            kind: "tool",
            name: "resolveItem",
            startMs: 100,
            endMs: 600,
            ok: false,
            error: "store down",
          },
        ],
      }),
      [
        '2026-10-17T16:11:14.491Z failed 3.7 s "hola, ¿qué podés hacer?"',
        "  error: session failed",
        "  agent 3.7 s wall, session not reported",
        "  resolveItem 0.5 s (from 0.1 s to 0.6 s), failed: store down",
      ].join("\n"),
    );
  });

  it("prints an aborted turn", () => {
    assert.match(
      formatTurn({ ...base, outcome: "aborted", error: "This operation was aborted" }),
      /^\S+ aborted 3\.7 s "hola, ¿qué podés hacer\?"\n {2}error: This operation was aborted/,
    );
  });
});

describe("formatTurns", () => {
  it("prints only the last N turns, oldest first, separated by a blank line", () => {
    const entries = ["uno", "dos", "tres"].map((ownerText) => ({ ...base, ownerText }));
    const printed = formatTurns(entries, 2);
    assert.doesNotMatch(printed, /"uno"/);
    assert.match(printed, /"dos"[\s\S]*\n\n[\s\S]*"tres"/);
  });

  it("says when there are no turns", () => {
    assert.equal(formatTurns([], 10), "The Turn Log has no turns yet.");
  });
});
