import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import {
  createClaudeCodeLlm,
  createProcessRunner,
  type LlmCall,
  type ProcessResult,
} from "./claude-code-llm.ts";

const promptsDir = mkdtempSync(join(tmpdir(), "prompts-"));
writeFileSync(join(promptsDir, "split-order.md"), "Split the order.");
writeFileSync(join(promptsDir, "resolve-item.md"), "Resolve the Item.");

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

const signal = new AbortController().signal;

const llmWith = (
  result: ProcessResult,
  calls: LlmCall[] = [],
  argsSeen: string[][] = [],
  signalsSeen: AbortSignal[] = [],
) =>
  createClaudeCodeLlm({
    vocabulary,
    promptsDir,
    run: (args, _input, runSignal) => {
      argsSeen.push(args);
      signalsSeen.push(runSignal);
      return Promise.resolve(result);
    },
    onCall: (call) => calls.push(call),
  });

describe("createClaudeCodeLlm", () => {
  it("returns the validated structured output and reports the call with its raw output", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const result = session({ structured_output: { kind: "match", candidates: ["yerba"] } });
    const llm = llmWith(result, calls, argsSeen);
    const input = {
      item: { phrase: "yerba", quantity: null, brand: null, terms: [], vagueWords: [] },
      evidence: [],
    };
    const answer = await llm.resolveItem(input, signal);
    assert.deepEqual(answer, { kind: "match", candidates: ["yerba"] });
    const args = argsSeen[0]!;
    const systemPrompt = args[args.indexOf("--system-prompt") + 1]!;
    assert.deepEqual(calls, [
      {
        task: "resolve-item",
        model: "claude-haiku-5-5",
        systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
        input,
        rawOutput: result.stdout,
        costUsd: 0.0137,
        durationMs: 3039,
      },
    ]);
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.ok(args.includes("--no-session-persistence"));
    assert.equal("$schema" in JSON.parse(args[args.indexOf("--json-schema") + 1]!), false);
    assert.ok(
      args[args.indexOf("--system-prompt") + 1]!.includes("grupo-yerba (Yerba): yerba (Yerba)"),
    );
  });

  it("fails on an answer that does not match the task's schema", async () => {
    const llm = llmWith(session({ structured_output: { items: [{ phrase: "" }] } }));
    await assert.rejects(llm.splitOrder("yerba", signal), /split-order returned an invalid answer/);
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
      llm.splitOrder("yerba", signal),
      /split-order failed \(error_max_budget_usd\): Reached maximum budget/,
    );
  });

  it("fails when the CLI exits with an error", async () => {
    const llm = llmWith({ exitCode: 1, stdout: "", stderr: "Not logged in\n" });
    await assert.rejects(llm.splitOrder("yerba", signal), /exited with 1: Not logged in/);
  });

  it("passes the signal of the call to the session it runs", async () => {
    const signalsSeen: AbortSignal[] = [];
    const controller = new AbortController();
    const llm = llmWith(
      session({ structured_output: { kind: "none", candidates: [] } }),
      [],
      [],
      signalsSeen,
    );
    await llm.resolveItem(
      {
        item: { phrase: "yerba", quantity: null, brand: null, terms: [], vagueWords: [] },
        evidence: [],
      },
      controller.signal,
    );
    assert.deepEqual(signalsSeen, [controller.signal]);
  });

  it("starts no session once the signal is aborted", async () => {
    const argsSeen: string[][] = [];
    const controller = new AbortController();
    controller.abort();
    const llm = llmWith(session({ structured_output: {} }), [], argsSeen);
    await assert.rejects(llm.splitOrder("yerba", controller.signal), { name: "AbortError" });
    assert.equal(argsSeen.length, 0);
  });
});

describe("createProcessRunner", () => {
  it("returns what the process wrote and its exit code", async () => {
    const run = createProcessRunner(process.execPath);
    const result = await run(
      ["-e", "process.stdin.pipe(process.stdout); process.exitCode = 3"],
      "hola",
      signal,
    );
    assert.deepEqual(result, { exitCode: 3, stdout: "hola", stderr: "" });
  });

  it("kills the process when the signal is aborted and rejects once it has exited", async () => {
    const run = createProcessRunner(process.execPath);
    const controller = new AbortController();
    const running = run(
      ["-e", "process.stdout.write('started'); setInterval(() => {}, 1000)"],
      "",
      controller.signal,
    );
    setTimeout(() => controller.abort(), 200);
    await assert.rejects(running, { name: "AbortError" });
  });
});
