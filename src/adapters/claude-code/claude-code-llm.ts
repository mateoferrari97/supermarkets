import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Vocabulary } from "../../core/product-types/schema.ts";
import {
  mapAnswerOutputSchema,
  resolveItemOutputSchema,
  rewordItemOutputSchema,
  selectionPolicySchema,
  splitOrderOutputSchema,
} from "./llm-output-schemas.ts";
import type { Llm, ResolveItemInput } from "../../core/order-resolution/llm.ts";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const DEFAULT_BUDGET_USD = 0.25;

export type ProcessResult = { exitCode: number; stdout: string; stderr: string };
export type ProcessRunner = (
  args: string[],
  input: string,
  signal: AbortSignal,
) => Promise<ProcessResult>;

export type LlmCall = { task: string; costUsd: number; durationMs: number };

export type ClaudeCodeLlmOptions = {
  vocabulary: Vocabulary;
  promptsDir: string;
  model?: string;
  budgetUsd?: number;
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

export function createClaudeCodeLlm({
  vocabulary,
  promptsDir,
  model = DEFAULT_MODEL,
  budgetUsd = DEFAULT_BUDGET_USD,
  run = createProcessRunner("claude"),
  onCall,
}: ClaudeCodeLlmOptions): Llm {
  const prompt = (task: string) => readFileSync(join(promptsDir, `${task}.md`), "utf8");
  const tree = renderTree(vocabulary);

  const ask = async <T>(
    task: string,
    systemPrompt: string,
    schema: z.ZodType<T>,
    input: unknown,
    signal: AbortSignal,
  ): Promise<T> => {
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
      String(budgetUsd),
      "--output-format",
      "json",
    ];
    signal.throwIfAborted();
    const result = await run(args, JSON.stringify(input), signal);
    if (result.exitCode !== 0) {
      throw new Error(
        `Claude Code session for ${task} exited with ${result.exitCode}: ${result.stderr.trim()}`,
      );
    }
    const session = sessionResultSchema.parse(JSON.parse(result.stdout));
    onCall?.({ task, costUsd: session.total_cost_usd, durationMs: session.duration_ms });
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

  return {
    splitOrder: (orderText, signal) =>
      ask(
        "split-order",
        prompt("split-order"),
        splitOrderOutputSchema,
        { order: orderText },
        signal,
      ),
    resolveItem: (input: ResolveItemInput, signal) =>
      ask(
        "resolve-item",
        `${prompt("resolve-item")}\n\n# Product Type tree\n\n${tree}`,
        resolveItemOutputSchema,
        input,
        signal,
      ),
    rewordItem: (input, signal) =>
      ask(
        "reword-item",
        `${prompt("reword-item")}\n\n# Product Type tree\n\n${tree}`,
        rewordItemOutputSchema,
        input,
        signal,
      ),
    mapAnswer: (input, signal) =>
      ask("map-answer", prompt("map-answer"), mapAnswerOutputSchema, input, signal),
    translatePreference: (input, signal) =>
      ask(
        "translate-preference",
        prompt("translate-preference"),
        selectionPolicySchema,
        input,
        signal,
      ),
  };
}

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema);
  return rest;
}

export function renderTree(vocabulary: Vocabulary): string {
  return vocabulary.groups
    .map(
      (group) =>
        `${group.id} (${group.name}): ${group.productTypes.map((productType) => `${productType.id} (${productType.name})`).join(", ")}`,
    )
    .join("\n");
}

export function createProcessRunner(command: string): ProcessRunner {
  return (args, input, signal) =>
    new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: tmpdir(),
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
