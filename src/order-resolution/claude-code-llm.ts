import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { Vocabulary } from "../product-types/schema.ts";
import {
  resolveItemOutputSchema,
  splitOrderOutputSchema,
  type Llm,
  type ResolveItemInput,
} from "./llm.ts";

export const DEFAULT_MODEL = "claude-haiku-5-5";
export const DEFAULT_BUDGET_USD = 0.25;

export type ProcessResult = { exitCode: number; stdout: string; stderr: string };
export type ProcessRunner = (args: string[], input: string) => Promise<ProcessResult>;

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
  run = runClaude,
  onCall,
}: ClaudeCodeLlmOptions): Llm {
  const prompt = (task: string) => readFileSync(join(promptsDir, `${task}.md`), "utf8");
  const tree = renderTree(vocabulary);

  const ask = async <T>(
    task: string,
    systemPrompt: string,
    schema: z.ZodType<T>,
    input: unknown,
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
    const result = await run(args, JSON.stringify(input));
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
    splitOrder: (orderText) =>
      ask("split-order", prompt("split-order"), splitOrderOutputSchema, { order: orderText }),
    resolveItem: (input: ResolveItemInput) =>
      ask(
        "resolve-item",
        `${prompt("resolve-item")}\n\n# Product Type tree\n\n${tree}`,
        resolveItemOutputSchema,
        input,
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

const runClaude: ProcessRunner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", args, { cwd: tmpdir(), stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", reject);
    child.on("close", (exitCode) => resolve({ exitCode: exitCode ?? 1, stdout, stderr }));
    child.stdin.end(input);
  });
