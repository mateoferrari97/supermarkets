import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { chatMessageSchema, type ChatMessage } from "../../core/agent-chat/chat.ts";
import { ordersSchema, type ChatOrder } from "../../core/agent-chat/order.ts";
import { profileSchema, type Profile } from "../../core/agent-chat/profile.ts";
import type { ConversationEvent } from "../../core/conversation-log/conversation-log.ts";
import {
  catalogProductsFrom,
  type CatalogProduct,
} from "../../core/order-matching/catalog-product.ts";
import type { AgentEvalRun } from "../../core/agent-chat/eval-run.ts";
import {
  agentEvalSetSchema,
  validateAgentEvalSet,
  type AgentEvalSet,
} from "../../core/agent-chat/eval-set.ts";
import type { EvalRun } from "../../core/order-matching/eval-run.ts";
import {
  evalSetSchema,
  exampleOrders,
  validateEvalSet,
  type EvalSet,
} from "../../core/order-matching/eval-set.ts";
import type { PlanningEvalRun } from "../../core/planning/eval-run.ts";
import {
  examplePlanningMessages,
  planningEvalSetSchema,
  validatePlanningEvalSet,
  type PlanningEvalSet,
} from "../../core/planning/eval-set.ts";
export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const CATALOG_DIR = ".data/carrefour";
export const CATALOG_PATH = `${CATALOG_DIR}/products.json`;
export const ORDER_EVAL_SET_PATH = "evals/order-matching.json";
export const ORDER_EVAL_RUNS_DIR = ".data/order-matching/eval-runs";
export const PLANNING_EVAL_SET_PATH = "evals/planning.json";
export const PLANNING_EVAL_RUNS_DIR = ".data/planning/eval-runs";
export const AGENT_EVAL_SET_PATH = "evals/agent.json";
export const AGENT_EVAL_RUNS_DIR = ".data/agent/eval-runs";
export const PROMPTS_DIR = "prompts";
export const CONVERSATIONS_DIR = ".data/conversations";
export const CHAT_DIR = ".data/chat";
export const CHAT_MESSAGES_PATH = `${CHAT_DIR}/messages.jsonl`;
export const CHAT_PROFILE_PATH = `${CHAT_DIR}/profile.json`;
export const CHAT_ORDERS_PATH = `${CHAT_DIR}/orders.json`;

const catalogSchema = z.object({
  products: z.array(
    z.object({
      productId: z.string(),
      skuIds: z.array(z.string()),
      name: z.string(),
      brand: z.string().nullable().optional(),
      department: z.string(),
      availableQuantity: z.number(),
      seccion: z.string().nullable(),
      familia: z.string().nullable(),
      tipo: z.string().nullable(),
      price: z.number().nullable(),
      measureUnit: z.string().nullable(),
      consumptionQuantity: z.string().nullable(),
      measurementUnit: z.string().nullable(),
      unitMultiplier: z.number().positive().nullable(),
      teasers: z.array(z.object({ name: z.string(), minimumQuantity: z.number() })),
    }),
  ),
});

const previousEvalRunSchema = z.object({
  startedAt: z.string(),
  cases: z.array(z.object({ id: z.string(), passed: z.boolean() })),
});

const catalogMetaSchema = z.object({ fetchedAt: z.string() });

export type CatalogRecord = z.infer<typeof catalogSchema>["products"][number];

export type PreviousEvalRun = z.infer<typeof previousEvalRunSchema>;

export type ConversationLogFile = { path: string; write: (event: ConversationEvent) => void };

export type ReportLogError = (message: string, error: unknown) => void;

const two = (value: number) => String(value).padStart(2, "0");

export const conversationFileName = (sessionId: string, startedAt: Date): string =>
  `${startedAt.getFullYear()}-${two(startedAt.getMonth() + 1)}-${two(startedAt.getDate())}-` +
  `${two(startedAt.getHours())}${two(startedAt.getMinutes())}${two(startedAt.getSeconds())}-` +
  `${sessionId}.jsonl`;

export type CatalogDownload = { meta: object; products: unknown[] };

const writeJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const failed = <T>(errors: string[]): Checked<T> => ({ ok: false, errors });

function environmentWithoutGit(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GIT_")) delete environment[name];
  }
  return environment;
}

export function createDataFiles(root = ".") {
  const at = (path: string) => join(root, path);
  const exists = (path: string) => existsSync(at(path));
  const readJson = (path: string): unknown => JSON.parse(readFileSync(at(path), "utf8"));
  const writeText = (path: string, text: string) => {
    writeFileSync(at(path), text);
  };

  const loadCatalog = (): Checked<CatalogRecord[]> => {
    if (!exists(CATALOG_PATH)) {
      return failed([`No Catalog Snapshot at ${CATALOG_PATH}. Run pnpm carrefour:catalog first.`]);
    }
    const catalog = catalogSchema.safeParse(readJson(CATALOG_PATH));
    if (catalog.success) return ok(catalog.data.products);
    const [issue] = catalog.error.issues;
    return failed([
      `The Catalog Snapshot at ${CATALOG_PATH} does not have what this version reads ` +
        `(at "${issue?.path.join(".") ?? ""}": ${issue?.message ?? ""}). ` +
        "Run pnpm carrefour:catalog again.",
    ]);
  };

  const loadCatalogProducts = (): Checked<CatalogProduct[]> => {
    const catalog = loadCatalog();
    if (!catalog.ok) return catalog;
    return ok(
      catalogProductsFrom(
        catalog.value.map((record) => ({ ...record, brand: record.brand ?? null })),
      ),
    );
  };

  const loadSnapshotFetchedAt = (): string | null => {
    if (!exists(CATALOG_PATH)) return null;
    const meta = catalogMetaSchema.safeParse(readJson(CATALOG_PATH));
    return meta.success ? meta.data.fetchedAt : null;
  };

  const promptTexts = (): string[] =>
    readdirSync(at(PROMPTS_DIR), { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".md"))
      .sort()
      .map((file) => readFileSync(at(join(PROMPTS_DIR, file)), "utf8"));

  const loadEvalSet = (): Checked<EvalSet> => {
    const examples = promptTexts().flatMap(exampleOrders);
    const input = readJson(ORDER_EVAL_SET_PATH);
    const errors = validateEvalSet(input, examples);
    return errors.length > 0 ? failed(errors) : ok(evalSetSchema.parse(input));
  };

  const loadPlanningEvalSet = (): Checked<PlanningEvalSet> => {
    const examples = promptTexts().flatMap(examplePlanningMessages);
    const input = readJson(PLANNING_EVAL_SET_PATH);
    const errors = validatePlanningEvalSet(input, examples);
    return errors.length > 0 ? failed(errors) : ok(planningEvalSetSchema.parse(input));
  };

  const loadAgentEvalSet = (): Checked<AgentEvalSet> => {
    const input = readJson(AGENT_EVAL_SET_PATH);
    const errors = validateAgentEvalSet(input);
    return errors.length > 0 ? failed(errors) : ok(agentEvalSetSchema.parse(input));
  };

  const saveAgentEvalRun = (run: AgentEvalRun): string => {
    mkdirSync(at(AGENT_EVAL_RUNS_DIR), { recursive: true });
    const path = join(AGENT_EVAL_RUNS_DIR, `${run.startedAt.replaceAll(":", "-")}.json`);
    writeText(path, writeJsonText(run));
    return path;
  };

  const savePlanningEvalRun = (run: PlanningEvalRun): string => {
    mkdirSync(at(PLANNING_EVAL_RUNS_DIR), { recursive: true });
    const path = join(PLANNING_EVAL_RUNS_DIR, `${run.startedAt.replaceAll(":", "-")}.json`);
    writeText(path, writeJsonText(run));
    return path;
  };

  const saveCatalog = ({ meta, products }: CatalogDownload, outputDir = CATALOG_DIR) => {
    const directory = resolve(root, outputDir);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "products.json"), JSON.stringify({ ...meta, products }, null, 2));
    return outputDir;
  };

  const saveEvalRun = (run: EvalRun): string => {
    mkdirSync(at(ORDER_EVAL_RUNS_DIR), { recursive: true });
    const path = join(ORDER_EVAL_RUNS_DIR, `${run.startedAt.replaceAll(":", "-")}.json`);
    writeText(path, writeJsonText(run));
    return path;
  };

  const loadLatestEvalRun = (): PreviousEvalRun | null => {
    if (!exists(ORDER_EVAL_RUNS_DIR)) return null;
    const [latest] = readdirSync(at(ORDER_EVAL_RUNS_DIR))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .reverse();
    return latest
      ? previousEvalRunSchema.parse(readJson(`${ORDER_EVAL_RUNS_DIR}/${latest}`))
      : null;
  };

  const loadChatMessages = (): Checked<ChatMessage[]> => {
    if (!exists(CHAT_MESSAGES_PATH)) return ok([]);
    const messages: ChatMessage[] = [];
    const errors: string[] = [];
    readFileSync(at(CHAT_MESSAGES_PATH), "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (line.trim() === "") return;
        let json: unknown;
        try {
          json = JSON.parse(line);
        } catch {
          errors.push(`${CHAT_MESSAGES_PATH} line ${index + 1} is not JSON.`);
          return;
        }
        const message = chatMessageSchema.safeParse(json);
        if (message.success) {
          messages.push(message.data);
          return;
        }
        const [issue] = message.error.issues;
        errors.push(
          `${CHAT_MESSAGES_PATH} line ${index + 1} is not a message ` +
            `(at "${issue?.path.join(".") ?? ""}": ${issue?.message ?? ""}).`,
        );
      });
    return errors.length > 0 ? failed(errors) : ok(messages);
  };

  const appendChatMessage = (message: ChatMessage): void => {
    mkdirSync(at(CHAT_DIR), { recursive: true });
    appendFileSync(at(CHAT_MESSAGES_PATH), `${JSON.stringify(chatMessageSchema.parse(message))}\n`);
  };

  const loadProfile = (): Checked<Profile | null> => {
    if (!exists(CHAT_PROFILE_PATH)) return ok(null);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(at(CHAT_PROFILE_PATH), "utf8"));
    } catch {
      return failed([`${CHAT_PROFILE_PATH} is not JSON.`]);
    }
    const profile = profileSchema.safeParse(json);
    if (profile.success) return ok(profile.data);
    const [issue] = profile.error.issues;
    return failed([
      `${CHAT_PROFILE_PATH} is not a profile ` +
        `(at "${issue?.path.join(".") ?? ""}": ${issue?.message ?? ""}).`,
    ]);
  };

  const saveProfile = (profile: Profile): void => {
    mkdirSync(at(CHAT_DIR), { recursive: true });
    writeFileSync(at(CHAT_PROFILE_PATH), `${JSON.stringify(profileSchema.parse(profile))}\n`);
  };

  const loadOrders = (): Checked<ChatOrder[]> => {
    if (!exists(CHAT_ORDERS_PATH)) return ok([]);
    let json: unknown;
    try {
      json = JSON.parse(readFileSync(at(CHAT_ORDERS_PATH), "utf8"));
    } catch {
      return failed([`${CHAT_ORDERS_PATH} is not JSON.`]);
    }
    const orders = ordersSchema.safeParse(json);
    if (orders.success) return ok(orders.data);
    const [issue] = orders.error.issues;
    return failed([
      `${CHAT_ORDERS_PATH} is not a list of orders ` +
        `(at "${issue?.path.join(".") ?? ""}": ${issue?.message ?? ""}).`,
    ]);
  };

  const saveOrders = (orders: ChatOrder[]): void => {
    mkdirSync(at(CHAT_DIR), { recursive: true });
    writeFileSync(at(CHAT_ORDERS_PATH), writeJsonText(ordersSchema.parse(orders)));
  };

  const headCommit = (): string | null => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        env: environmentWithoutGit(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    } catch {
      return null;
    }
  };

  const openConversationLog = (
    sessionId: string,
    startedAt: Date,
    reportError: ReportLogError = (message, error) => console.error(message, error),
  ): ConversationLogFile => {
    const path = join(CONVERSATIONS_DIR, conversationFileName(sessionId, startedAt));
    const write = (event: ConversationEvent) => {
      try {
        mkdirSync(at(CONVERSATIONS_DIR), { recursive: true });
        appendFileSync(at(path), `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`);
      } catch (error) {
        reportError(`Could not write the Conversation Log ${path}`, error);
      }
    };
    return { path, write };
  };

  return {
    promptsDir: at(PROMPTS_DIR),
    headCommit,
    openConversationLog,
    loadChatMessages,
    appendChatMessage,
    loadProfile,
    saveProfile,
    loadOrders,
    saveOrders,
    loadCatalogProducts,
    loadSnapshotFetchedAt,
    loadEvalSet,
    loadPlanningEvalSet,
    savePlanningEvalRun,
    loadAgentEvalSet,
    saveAgentEvalRun,
    saveCatalog,
    saveEvalRun,
    loadLatestEvalRun,
  };
}
