import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
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
mkdirSync(join(promptsDir, "order-resolution"));
mkdirSync(join(promptsDir, "order-matching"));
writeFileSync(join(promptsDir, "order-resolution", "split-order.md"), "Split the order.");
writeFileSync(join(promptsDir, "order-resolution", "resolve-item.md"), "Resolve the Item.");
writeFileSync(join(promptsDir, "order-matching", "parse-order.md"), "Parse the order.");

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
  inputsSeen: string[] = [],
) =>
  createClaudeCodeLlm({
    vocabulary,
    promptsDir,
    run: (args, input, runSignal) => {
      argsSeen.push(args);
      inputsSeen.push(input);
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
        effort: null,
        systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
        input,
        rawOutput: result.stdout,
        costUsd: 0.0137,
        durationMs: 3039,
      },
    ]);
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args.includes("--effort"), false);
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

describe("parseOrder", () => {
  const line = (fields: Record<string, unknown>) => ({
    original: "coca 2,25",
    product: "Gaseosa cola",
    brand: "Coca Cola",
    size: "common",
    quantity: "minimum",
    ...fields,
  });
  const answer = (lines: Record<string, unknown>[], ignoredPreference = false) =>
    session({ structured_output: { lines, ignoredPreference } });

  it("runs Sonnet at low effort with its prompt and the order wrapped in <order>", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(answer([line({})]), calls, argsSeen, [], inputsSeen);
    await llm.parseOrder("coca 2,25, pan", signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], "low");
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Parse the order.");
    assert.deepEqual(inputsSeen, ["<order>\ncoca 2,25, pan\n</order>"]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [
        {
          task: "parse-order",
          model: "claude-sonnet-5-5",
          effort: "low",
          input: "<order>\ncoca 2,25, pan\n</order>",
        },
      ],
    );
  });

  it("runs the model and effort it is given for the task", async () => {
    const argsSeen: string[][] = [];
    const llm = createClaudeCodeLlm({
      vocabulary,
      promptsDir,
      models: { "parse-order": { model: "claude-haiku-5-5", effort: null } },
      run: (args) => {
        argsSeen.push(args);
        return Promise.resolve(answer([line({})]));
      },
    });
    await llm.parseOrder("coca", signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-haiku-5-5");
    assert.equal(args.includes("--effort"), false);
  });

  it("parses each line's size and quantity into the Item", async () => {
    const llm = llmWith(
      answer(
        [
          line({ size: "2.25 l" }),
          line({
            original: "picana 2kg",
            product: "Picaña",
            brand: null,
            size: "common",
            quantity: "1.5 kg",
          }),
          line({
            original: "coca cola zero grande",
            product: "Gaseosa cola zero",
            size: "biggest",
            quantity: "2 unit",
          }),
        ],
        true,
      ),
    );
    assert.deepEqual(await llm.parseOrder("coca 2,25, picana 2kg", signal), {
      items: [
        {
          original: "coca 2,25",
          product: "Gaseosa cola",
          brand: "Coca Cola",
          size: { kind: "exact", dimension: "volume", amount: 2250 },
          quantity: { kind: "minimum" },
        },
        {
          original: "picana 2kg",
          product: "Picaña",
          brand: null,
          size: { kind: "common" },
          quantity: { kind: "weight", grams: 1500 },
        },
        {
          original: "coca cola zero grande",
          product: "Gaseosa cola zero",
          brand: "Coca Cola",
          size: { kind: "biggest" },
          quantity: { kind: "units", count: 2 },
        },
      ],
      ignoredPreference: true,
    });
  });

  it.each([
    ["a size it cannot read", { size: "grande" }],
    ["a size of zero", { size: "0 ml" }],
    ["a weight as the quantity's size", { quantity: "2 l" }],
    ["a quantity of zero", { quantity: "0 kg" }],
    ["a count of no units", { quantity: "0 unit" }],
  ])("fails on %s", async (_case, fields) => {
    const llm = llmWith(answer([line(fields)]));
    await assert.rejects(llm.parseOrder("coca", signal), /parse-order returned an invalid answer/);
  });

  it("fails on an answer without lines", async () => {
    const llm = llmWith(answer([]));
    await assert.rejects(
      llm.parseOrder("pago con Visa", signal),
      /parse-order returned an invalid answer/,
    );
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
