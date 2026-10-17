import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../../core/order-matching/catalog-product.ts";
import type { FitProductsInput } from "../../core/order-matching/match-items.ts";
import {
  createClaudeCodeLlm,
  createProcessRunner,
  TASK_BUDGETS_USD,
  type LlmCall,
  type ProcessResult,
} from "./claude-code-llm.ts";

const promptsDir = mkdtempSync(join(tmpdir(), "prompts-"));
mkdirSync(join(promptsDir, "order-matching"));
writeFileSync(join(promptsDir, "order-matching", "fit-products.md"), "Fit the products.");

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
    promptsDir,
    run: (args, input, runSignal) => {
      argsSeen.push(args);
      inputsSeen.push(input);
      signalsSeen.push(runSignal);
      return Promise.resolve(result);
    },
    onCall: (call) => calls.push(call),
  });

const fits = { fits: [1], closest: [], note: null, question: null };

describe("createClaudeCodeLlm", () => {
  const matches = (): FitProductsInput => ({
    item: {
      original: "yerba",
      product: "Yerba",
      brand: null,
      size: { kind: "common" },
      quantity: { kind: "minimum" },
    },
    alsoInThisLine: [],
    matches: [],
  });

  it("returns the validated structured output and reports the call with its raw output", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const result = session({ structured_output: fits });
    const llm = llmWith(result, calls, argsSeen);
    assert.deepEqual(await llm.fitProducts(matches(), signal), fits);
    const args = argsSeen[0]!;
    const systemPrompt = args[args.indexOf("--system-prompt") + 1]!;
    assert.deepEqual(calls, [
      {
        task: "fit-products",
        model: "claude-sonnet-5-5",
        effort: "low",
        item: "yerba",
        systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
        input: calls[0]!.input,
        rawOutput: result.stdout,
        costUsd: 0.0137,
        durationMs: 3039,
      },
    ]);
    assert.equal(args[args.indexOf("--tools") + 1], "");
    assert.ok(args.includes("--no-session-persistence"));
    assert.equal("$schema" in JSON.parse(args[args.indexOf("--json-schema") + 1]!), false);
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
      llm.fitProducts(matches(), signal),
      /fit-products failed \(error_max_budget_usd\): Reached maximum budget/,
    );
  });

  it("fails when the CLI exits with an error", async () => {
    const llm = llmWith({ exitCode: 1, stdout: "", stderr: "Not logged in\n" });
    await assert.rejects(llm.fitProducts(matches(), signal), /exited with 1: Not logged in/);
  });

  it("passes the signal of the call to the session it runs", async () => {
    const signalsSeen: AbortSignal[] = [];
    const controller = new AbortController();
    const llm = llmWith(session({ structured_output: fits }), [], [], signalsSeen);
    await llm.fitProducts(matches(), controller.signal);
    assert.deepEqual(signalsSeen, [controller.signal]);
  });

  it("starts no session once the signal is aborted", async () => {
    const argsSeen: string[][] = [];
    const controller = new AbortController();
    controller.abort();
    const llm = llmWith(session({ structured_output: {} }), [], argsSeen);
    await assert.rejects(llm.fitProducts(matches(), controller.signal), { name: "AbortError" });
    assert.equal(argsSeen.length, 0);
  });

  it("gives the session of the task its own budget", async () => {
    const argsSeen: string[][] = [];
    const llm = createClaudeCodeLlm({
      promptsDir,
      budgetsUsd: { "fit-products": 0.05 },
      run: (args) => {
        argsSeen.push(args);
        return Promise.resolve(session({ structured_output: fits }));
      },
    });
    await llm.fitProducts(matches(), signal);
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--max-budget-usd") + 1], "0.05");
    assert.equal(TASK_BUDGETS_USD["fit-products"], 0.25);
  });
});

describe("fitProducts", () => {
  const product = (name: string, brand: string | null, tipo: string | null): CatalogProduct => ({
    productId: name,
    itemId: name,
    name,
    brand,
    department: "Carnes y pescados",
    tipo,
    price: 1000,
    inStock: true,
    sale: { kind: "packaged", size: null },
    teasers: [],
  });
  const input = (alsoInThisLine: string[] = []): FitProductsInput => ({
    item: {
      original: "1 y 1 chorizo morzilla la divisa",
      product: "Morcilla",
      brand: "La Divisa",
      size: { kind: "common" },
      quantity: { kind: "units", count: 1 },
    },
    alsoInThisLine,
    matches: [
      product("Morcilla copetín al vacio La Divisa 400 grs", "La Divisa", "Morcilla"),
      product("Chorizo puro de cerdo La Divisa 400 grs", "La Divisa", null),
      product("Morcilla vasca Paladini x kg", null, "Morcilla"),
    ],
  });
  const answer = (fields: Record<string, unknown>) =>
    session({
      structured_output: { fits: [1], closest: [], note: null, question: null, ...fields },
    });

  it("runs Sonnet at low effort with its prompt and the line it renders", async () => {
    const calls: LlmCall[] = [];
    const argsSeen: string[][] = [];
    const inputsSeen: string[] = [];
    const llm = llmWith(
      answer({ note: "Tomé 'morzilla' como morcilla." }),
      calls,
      argsSeen,
      [],
      inputsSeen,
    );
    assert.deepEqual(await llm.fitProducts(input(), signal), {
      fits: [1],
      closest: [],
      note: "Tomé 'morzilla' como morcilla.",
      question: null,
    });
    const args = argsSeen[0]!;
    assert.equal(args[args.indexOf("--model") + 1], "claude-sonnet-5-5");
    assert.equal(args[args.indexOf("--effort") + 1], "low");
    assert.equal(args[args.indexOf("--system-prompt") + 1], "Fit the products.");
    const line = [
      "<line>",
      "<original>1 y 1 chorizo morzilla la divisa</original>",
      "<product>Morcilla</product>",
      "<brand>La Divisa</brand>",
      "<candidates>",
      "1. Morcilla copetín al vacio La Divisa 400 grs | La Divisa | Morcilla",
      "2. Chorizo puro de cerdo La Divisa 400 grs | La Divisa | sin tipo",
      "3. Morcilla vasca Paladini x kg | sin marca | Morcilla",
      "</candidates>",
      "</line>",
    ].join("\n");
    assert.deepEqual(inputsSeen, [line]);
    assert.deepEqual(
      calls.map(({ task, model, effort, input }) => ({ task, model, effort, input })),
      [{ task: "fit-products", model: "claude-sonnet-5-5", effort: "low", input: line }],
    );
  });

  it("names the other products of the same words in <also-in-this-line>", async () => {
    const inputsSeen: string[] = [];
    const llm = llmWith(answer({}), [], [], [], inputsSeen);
    await llm.fitProducts(input(["Chorizo parrillero", "Salchicha parrillera"]), signal);
    assert.match(
      inputsSeen[0]!,
      /<brand>La Divisa<\/brand>\n<also-in-this-line>Chorizo parrillero; Salchicha parrillera<\/also-in-this-line>\n<candidates>/,
    );
  });

  it("returns a question with the closest candidates when nothing fits", async () => {
    const llm = llmWith(answer({ fits: [], closest: [3, 1], question: "¿Te sirve alguna?" }));
    assert.deepEqual(await llm.fitProducts(input(), signal), {
      fits: [],
      closest: [3, 1],
      note: null,
      question: "¿Te sirve alguna?",
    });
  });

  it.each([
    ["a number that is not a candidate number", { fits: [0] }],
    ["a question that is empty", { fits: [], question: "" }],
  ])("fails on %s", async (_case, fields) => {
    const llm = llmWith(answer(fields));
    await assert.rejects(
      llm.fitProducts(input(), signal),
      /fit-products returned an invalid answer/,
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

  it("starts the process with the parent environment and nonessential traffic turned off", async () => {
    process.env.PROCESS_RUNNER_TEST_PARENT = "from-parent";
    try {
      const run = createProcessRunner(process.execPath);
      const result = await run(
        [
          "-e",
          "process.stdout.write(JSON.stringify([process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, process.env.PROCESS_RUNNER_TEST_PARENT]))",
        ],
        "",
        signal,
      );
      assert.deepEqual(JSON.parse(result.stdout), ["1", "from-parent"]);
    } finally {
      delete process.env.PROCESS_RUNNER_TEST_PARENT;
    }
  });
});
