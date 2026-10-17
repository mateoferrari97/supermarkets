import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { FitProductsInput } from "../../core/order-matching/match-items.ts";
import { fitProductsOutputSchema } from "./llm-output-schemas.ts";
import type { Llm } from "../../core/order-matching/llm.ts";

export type LlmTask = "fit-products";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type TaskModel = { model: string; effort: Effort | null };

export const TASK_MODELS: Record<LlmTask, TaskModel> = {
  "fit-products": { model: "claude-sonnet-5-5", effort: null },
};

export const TASK_BUDGETS_USD: Record<LlmTask, number> = {
  "fit-products": 0.25,
};

const PROMPT_FILES: Record<LlmTask, string> = {
  "fit-products": "order-matching/fit-products.md",
};

export type ProcessResult = { exitCode: number; stdout: string; stderr: string };
export type ProcessRunner = (
  args: string[],
  input: string,
  signal: AbortSignal,
) => Promise<ProcessResult>;

export type LlmCall = {
  task: string;
  model: string;
  effort: Effort | null;
  systemPromptSha256: string;
  input: unknown;
  rawOutput: string;
  costUsd: number;
  durationMs: number;
};

export type ClaudeCodeLlmOptions = {
  promptsDir: string;
  models?: Partial<Record<LlmTask, TaskModel>>;
  budgetsUsd?: Partial<Record<LlmTask, number>>;
  run?: ProcessRunner;
  onCall?: (call: LlmCall) => void;
};

const sessionResultSchema = z.object({
  is_error: z.boolean(),
  subtype: z.string(),
  total_cost_usd: z.number(),
  duration_ms: z.number(),
  errors: z.array(z.string()).optional(),
  structured_output: z.unknown().optional(),
});

function createSessions({
  promptsDir,
  models = {},
  budgetsUsd = {},
  run = createProcessRunner("claude"),
  onCall,
}: ClaudeCodeLlmOptions) {
  const prompt = (task: LlmTask) => readFileSync(join(promptsDir, PROMPT_FILES[task]), "utf8");

  const ask = async <T>(
    task: LlmTask,
    systemPrompt: string,
    schema: z.ZodType<T>,
    input: unknown,
    signal: AbortSignal,
  ): Promise<T> => {
    const { model, effort } = models[task] ?? TASK_MODELS[task];
    const args = [
      "-p",
      "--model",
      model,
      "--system-prompt",
      systemPrompt,
      "--json-schema",
      JSON.stringify(jsonSchemaFor(schema)),
      "--tools",
      "",
      "--restricted",
      "--strict-mcp-config",
      "--no-session-persistence",
      "--max-budget-usd",
      String(budgetsUsd[task] ?? TASK_BUDGETS_USD[task]),
      "--output-format",
      "json",
      ...(effort === null ? [] : ["--effort", effort]),
    ];
    signal.throwIfAborted();
    const message = typeof input === "string" ? input : JSON.stringify(input);
    const result = await run(args, message, signal);
    if (result.exitCode !== 0) {
      throw new Error(
        `Claude Code session for ${task} exited with ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }
    const session = sessionResultSchema.parse(JSON.parse(result.stdout));
    onCall?.({
      task,
      model,
      effort,
      systemPromptSha256: createHash("sha256").update(systemPrompt).digest("hex"),
      input,
      rawOutput: result.stdout,
      costUsd: session.total_cost_usd,
      durationMs: session.duration_ms,
    });
    if (session.is_error || session.subtype !== "success") {
      throw new Error(
        `Claude Code session for ${task} failed (${session.subtype}): ${(session.errors ?? []).join("; ")}`,
      );
    }
    const output = schema.safeParse(session.structured_output);
    if (!output.success) {
      throw new Error(
        `Claude Code session for ${task} returned an invalid answer: ${output.error.message}`,
      );
    }
    return output.data;
  };

  return { prompt, ask };
}

export function createClaudeCodeLlm(options: ClaudeCodeLlmOptions): Llm {
  const { prompt, ask } = createSessions(options);
  return {
    fitProducts: (input, signal) =>
      ask(
        "fit-products",
        prompt("fit-products"),
        fitProductsOutputSchema,
        renderLine(input),
        signal,
      ),
  };
}

export function renderLine({ item, alsoInThisLine, matches }: FitProductsInput): string {
  return [
    "<line>",
    `<original>${item.original}</original>`,
    `<product>${item.product}</product>`,
    `<brand>${item.brand ?? "null"}</brand>`,
    ...(alsoInThisLine.length > 0
      ? [`<also-in-this-line>${alsoInThisLine.join("; ")}</also-in-this-line>`]
      : []),
    "<candidates>",
    ...matches.map(
      (product, index) =>
        `${index + 1}. ${product.name} | ${product.brand ?? "sin marca"} | ${product.tipo ?? "sin tipo"}`,
    ),
    "</candidates>",
    "</line>",
  ].join("\n");
}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema);
  return rest;
}

export function createProcessRunner(command: string): ProcessRunner {
  return (args, input, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: tmpdir(),
        env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1" },
        stdio: ["pipe", "pipe", "pipe"],
        signal,
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const fail = (error: Error) => {
        if (!signal.aborted) reject(error);
      };
      child.stdin.on("error", fail);
      child.on("error", fail);
      child.on("close", (exitCode) => {
        if (signal.aborted) reject(abortReason(signal));
        else resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      });
      child.stdin.end(input);
    });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error(String(signal.reason));
}
