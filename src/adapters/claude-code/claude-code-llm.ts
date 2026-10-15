import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  parseQuantity,
  parseSize,
  type Item,
  type ParseOrderOutput,
} from "../../core/order-matching/item.ts";
import {
  ALTERNATIVES_LIMIT,
  type FitProductsInput,
  type FitProductsOutput,
} from "../../core/order-matching/match-items.ts";
import type {
  ReadReplyInput,
  ReadReplyOutput,
  ReplyEntry,
} from "../../core/order-matching/read-reply.ts";
import type { CatalogProduct } from "../../core/order-matching/catalog-product.ts";
import {
  fitProductsOutputSchema,
  parseOrderOutputSchema,
  readReplyOutputSchema,
  type LineOutput,
} from "./llm-output-schemas.ts";
import type { Llm } from "../../core/order-matching/llm.ts";

export const DEFAULT_BUDGET_USD = 0.25;

export type LlmTask = "parse-order" | "fit-products" | "read-reply";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export type TaskModel = { model: string; effort: Effort | null };

export const TASK_MODELS: Record<LlmTask, TaskModel> = {
  "parse-order": { model: "claude-sonnet-5-5", effort: "low" },
  "fit-products": { model: "claude-sonnet-5-5", effort: null },
  "read-reply": { model: "claude-sonnet-5-5", effort: "low" },
};

const PROMPT_FILES: Record<LlmTask, string> = {
  "parse-order": "order-matching/parse-order.md",
  "fit-products": "order-matching/fit-products.md",
  "read-reply": "order-matching/read-reply.md",
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
  promptsDir,
  models = {},
  budgetUsd = DEFAULT_BUDGET_USD,
  run = createProcessRunner("claude"),
  onCall,
}: ClaudeCodeLlmOptions): Llm {
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
      String(budgetUsd),
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

  return {
    parseOrder: async (orderText, signal) =>
      readParseOrder(
        await ask(
          "parse-order",
          prompt("parse-order"),
          parseOrderOutputSchema,
          `<order>\n${orderText}\n</order>`,
          signal,
        ),
      ),
    fitProducts: async (input, signal) =>
      checkFitProducts(
        input,
        await ask(
          "fit-products",
          prompt("fit-products"),
          fitProductsOutputSchema,
          renderLine(input),
          signal,
        ),
      ),
    readReply: async (input, signal) =>
      readReadReply(
        input,
        await ask(
          "read-reply",
          prompt("read-reply"),
          readReplyOutputSchema,
          renderReply(input),
          signal,
        ),
      ),
  };
}

function readParseOrder({
  lines,
  ignoredPreference,
}: z.infer<typeof parseOrderOutputSchema>): ParseOrderOutput {
  return { items: lines.map((line) => readLine("parse-order", line)), ignoredPreference };
}

function readLine(task: LlmTask, line: LineOutput): Item {
  const size = parseSize(line.size);
  const quantity = parseQuantity(line.quantity);
  if (!size || !quantity) {
    throw new Error(
      `Claude Code session for ${task} returned an invalid answer: "${line.original}" has size "${line.size}" and quantity "${line.quantity}"`,
    );
  }
  return { original: line.original, product: line.product, brand: line.brand, size, quantity };
}

export function renderReply({ items, reply }: ReadReplyInput): string {
  return [
    "<items>",
    ...items.flatMap((item, index) =>
      item.kind === "asked"
        ? [
            `<item number="${index + 1}" state="asked">`,
            `<original>${item.original}</original>`,
            `<question>${item.question.text}</question>`,
            "<alternatives>",
            ...item.question.alternatives.map(
              (product, number) => `${number + 1}. ${describeProduct(product)}`,
            ),
            "</alternatives>",
            "</item>",
          ]
        : [
            `<item number="${index + 1}" state="in-cart">`,
            `<original>${item.original}</original>`,
            `<bought>${describeProduct(item.product)}</bought>`,
            "</item>",
          ],
    ),
    "</items>",
    `<reply>\n${reply}\n</reply>`,
  ].join("\n");
}

function describeProduct(product: CatalogProduct): string {
  return `${product.name} | ${product.brand ?? "sin marca"}`;
}

function readReadReply(
  { items }: ReadReplyInput,
  { entries, newLines, ignoredPreference }: z.infer<typeof readReplyOutputSchema>,
): ReadReplyOutput {
  const fail = (problem: string): never => {
    throw new Error(`Claude Code session for read-reply returned an invalid answer: ${problem}`);
  };
  const seen = new Set<number>();
  const read = entries.map((entry): ReplyEntry => {
    const item =
      items[entry.item - 1] ?? fail(`item ${entry.item} is not among its ${items.length} Items`);
    if (seen.has(entry.item)) fail(`more than one entry for item ${entry.item}`);
    seen.add(entry.item);
    if (item.kind === "bought") {
      if (entry.kind === "choice") fail(`a choice for item ${entry.item}, which was not asked`);
      if (entry.kind === "unanswered" && entry.question === null) {
        fail(`unanswered without a question for item ${entry.item}, which was not asked`);
      }
    }
    if (entry.kind === "choice" && item.kind === "asked") {
      const count = item.question.alternatives.length;
      if (entry.alternative > count) {
        fail(`alternative ${entry.alternative} of item ${entry.item} is not among its ${count}`);
      }
    }
    return entry.kind === "lines"
      ? {
          item: entry.item,
          kind: "lines",
          lines: entry.lines.map((line) => readLine("read-reply", line)),
        }
      : entry;
  });
  const unanswered = items.flatMap((item, index): ReplyEntry[] =>
    item.kind === "asked" && !seen.has(index + 1)
      ? [{ item: index + 1, kind: "unanswered", question: null }]
      : [],
  );
  return {
    entries: [...read, ...unanswered].sort((one, other) => one.item - other.item),
    newLines: newLines.map((line) => readLine("read-reply", line)),
    ignoredPreference,
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

function checkFitProducts(
  { item, matches }: FitProductsInput,
  output: FitProductsOutput,
): FitProductsOutput {
  const fail = (problem: string) => {
    throw new Error(
      `Claude Code session for fit-products returned an invalid answer for "${item.original}": ${problem}`,
    );
  };
  const outside = [...output.fits, ...output.closest].filter((number) => number > matches.length);
  if (outside.length > 0) fail(`${outside.join(", ")} not among its ${matches.length} Matches`);
  if ((output.question === null) !== output.fits.length > 0) {
    fail("a question must be set exactly when no product fits");
  }
  if (output.closest.length > 0 && output.fits.length > 0) fail("closest set while products fit");
  if (output.closest.length > ALTERNATIVES_LIMIT) {
    fail(`${output.closest.length} closest, more than ${ALTERNATIVES_LIMIT}`);
  }
  return output;
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
