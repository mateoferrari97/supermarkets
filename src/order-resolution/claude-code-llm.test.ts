import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import { createClaudeCodeLlm, type LlmCall, type ProcessResult } from "./claude-code-llm.ts";

const promptsDir = mkdtempSync(join(tmpdir(), "prompts-"));
writeFileSync(join(promptsDir, "split-order.md"), "Split the order.");
writeFileSync(join(promptsDir, "resolve-item.md"), "Resolve the Item.");
writeFileSync(join(promptsDir, "translate-preference.md"), "Translate the preference.");

const vocabulary = {
  groups: [{ id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] }],
};

const session = (fields: Record<string, unknown>): ProcessResult => ({
  exitCode: 0,
  stderr: "",
  stdout: JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    total_cost_usd: 0.0137,
    duration_ms: 3039,
    ...fields,
  }),
});

const llmWith = (result: ProcessResult, calls: LlmCall[] = [], argsSeen: string[][] = []) =>
  createClaudeCodeLlm({
    vocabulary,
    promptsDir,
    run: (args) => {
      argsSeen.push(args);
      return Promise.resolve(result);
    },
    onCall: (call) => calls.push(call),
  });

describe("createClaudeCodeLlm", () => {
  it("returns the validated structured output and reports the cost of the call", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const llm = llmWith(
      session({ structured_output: { kind: "match", candidates: ["yerba"] } }),
      calls,
      argsSeen,
    );
    const answer = await llm.resolveItem({
      item: { phrase: "yerba", quantity: null, brand: null, terms: [], vagueWords: [] },
      evidence: [],
    });
    assert.deepEqual(answer, { kind: "match", candidates: ["yerba"] });
    assert.deepEqual(calls, [{ task: "resolve-item", costUsd: 0.0137, durationMs: 3039 }]);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.ok(args.includes("--no-session-persistence"));
    assert.equal("$schema" in JSON.parse(args[args.indexOf("--json-schema") + 1]!), false);
    assert.ok(
      args[args.indexOf("--system-prompt") + 1]!.includes("grupo-yerba (Yerba): yerba (Yerba)"),
    );
  });

  it("translates a preference into a validated Selection Policy with its own prompt", async () => {
    const argsSeen: string[][] = [];
    const policy = {
      ranking: "cheapest-per-unit",
      brandsOnly: [],
      brandsPreferred: ["Sancor", "Ilolay"],
      brandsExcluded: ["Marolio"],
      unexpressed: ["que sea orgánico"],
    };
    const llm = llmWith(session({ structured_output: policy }), [], argsSeen);
    assert.deepEqual(
      await llm.translatePreference({ preference: "lo más barato, prefiero Sancor o Ilolay" }),
      policy,
    );
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Translate the preference.");
    const schema = JSON.parse(args[args.indexOf("--json-schema") + 1]!) as {
      properties: { ranking: { enum: string[] } };
    };
    assert.deepEqual(schema.properties.ranking.enum, ["savings-first", "cheapest-per-unit"]);
  });

  it("fails on a Selection Policy with a ranking no rule knows", async () => {
    const llm = llmWith(
      session({
        structured_output: {
          ranking: "best-quality",
          brandsOnly: [],
          brandsPreferred: [],
          brandsExcluded: [],
          unexpressed: [],
        },
      }),
    );
    await assert.rejects(
      llm.translatePreference({ preference: "lo mejor" }),
      /translate-preference returned an invalid answer/,
    );
  });

  it("fails on an answer that does not match the task's schema", async () => {
    const llm = llmWith(session({ structured_output: { items: [{ phrase: "" }] } }));
    await assert.rejects(llm.splitOrder("yerba"), /split-order returned an invalid answer/);
  });

  it("fails when the session reports an error such as an exhausted budget", async () => {
    const llm = llmWith(
      session({
        is_error: true,
        subtype: "error_max_budget_usd",
        errors: ["Reached maximum budget ($0.0001)"],
      }),
    );
    await assert.rejects(
      llm.splitOrder("yerba"),
      /split-order failed \(error_max_budget_usd\): Reached maximum budget/,
    );
  });

  it("fails when the CLI exits with an error", async () => {
    const llm = llmWith({ exitCode: 1, stdout: "", stderr: "Not logged in\n" });
    await assert.rejects(llm.splitOrder("yerba"), /exited with 1: Not logged in/);
  });
});
