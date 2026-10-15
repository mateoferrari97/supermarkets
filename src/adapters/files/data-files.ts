import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import type { ConversationEvent } from "../../core/conversation-log/conversation-log.ts";
import {
  validateEvalSet,
  evalSetSchema,
  type EvalSet,
} from "../../core/order-resolution/eval-set.ts";
import type { EvalRun } from "../../core/order-resolution/eval-run.ts";
import {
  paymentCardTableSchema,
  validatePaymentCards,
  type PaymentCardTable,
} from "../../core/product-selection/payment-cards.ts";
import {
  decisionsSchema,
  renderSummary,
  type Consolidation,
  type Decision,
  type RemainingDoubt,
} from "../../core/product-type-seed/consolidate.ts";
import {
  proposalSchema,
  validateProposal,
  type Proposal,
} from "../../core/product-type-seed/proposal.ts";
import { GROCERY_DEPARTMENTS, type Part } from "../../core/product-type-seed/split.ts";
import {
  tipoMappingSchema,
  vocabularySchema,
  type TipoMapping,
  type Vocabulary,
} from "../../core/product-types/schema.ts";
import { validateProductTypes } from "../../core/product-types/validate.ts";

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const CATALOG_DIR = ".data/carrefour";
export const CATALOG_PATH = `${CATALOG_DIR}/products.json`;
export const SEED_DIR = `${CATALOG_DIR}/seed`;
export const PARTS_DIR = `${SEED_DIR}/parts`;
export const PROPOSALS_DIR = `${SEED_DIR}/proposals`;
export const DECISIONS_PATH = `${SEED_DIR}/decisions.json`;
export const DOUBTS_PATH = `${SEED_DIR}/doubts.json`;
export const SUMMARY_PATH = `${SEED_DIR}/summary.md`;
export const VOCABULARY_PATH = "vocabulary/product-types.json";
export const CARREFOUR_MAPPING_PATH = "vocabulary/carrefour-tipos.json";
export const PAYMENT_CARDS_PATH = "vocabulary/carrefour-payment-cards.json";
export const ORDER_EVAL_SET_PATH = "evals/order-resolution.json";
export const ORDER_EVAL_RUNS_DIR = ".data/order-resolution/eval-runs";
export const PROMPTS_DIR = "prompts/order-resolution";
export const CONVERSATIONS_DIR = ".data/conversations";

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
      measureUnit: z.string().nullable(),
      consumptionQuantity: z.string().nullable(),
    }),
  ),
});

const previousEvalRunSchema = z.object({
  startedAt: z.string(),
  cases: z.array(z.object({ id: z.string(), outcome: z.enum(["hit", "miss", "error"]) })),
});

export type CatalogRecord = z.infer<typeof catalogSchema>["products"][number];

export type ProductTypes = { vocabulary: Vocabulary; mapping: TipoMapping };

export type OrderFiles = ProductTypes & {
  catalog: CatalogRecord[];
  paymentCards: PaymentCardTable;
};

export type CheckedEvalSet = { evalSet: EvalSet; vocabulary: Vocabulary };

export type PreviousEvalRun = z.infer<typeof previousEvalRunSchema>;

export type ConversationLogFile = { path: string; write: (event: ConversationEvent) => void };

export type ReportLogError = (message: string, error: unknown) => void;

const two = (value: number) => String(value).padStart(2, "0");

export const conversationFileName = (sessionId: string, startedAt: Date): string =>
  `${startedAt.getFullYear()}-${two(startedAt.getMonth() + 1)}-${two(startedAt.getDate())}-` +
  `${two(startedAt.getHours())}${two(startedAt.getMinutes())}${two(startedAt.getSeconds())}-` +
  `${sessionId}.jsonl`;

export type CatalogDownload = { meta: object; products: unknown[]; tipos: unknown[] };

const writeJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

const ok = <T>(value: T): Checked<T> => ({ ok: true, value });
const failed = <T>(errors: string[]): Checked<T> => ({ ok: false, errors });

export function createDataFiles(root = ".") {
  const at = (path: string) => join(root, path);
  const exists = (path: string) => existsSync(at(path));
  const readJson = (path: string): unknown => JSON.parse(readFileSync(at(path), "utf8"));
  const writeText = (path: string, text: string) => {
    writeFileSync(at(path), text);
  };

  const loadCatalog = (): Checked<CatalogRecord[]> =>
    exists(CATALOG_PATH)
      ? ok(catalogSchema.parse(readJson(CATALOG_PATH)).products)
      : failed([`No Catalog Snapshot at ${CATALOG_PATH}. Run pnpm carrefour:catalog first.`]);

  const loadProductTypes = (): Checked<ProductTypes> => {
    const vocabulary = readJson(VOCABULARY_PATH);
    const mapping = readJson(CARREFOUR_MAPPING_PATH);
    const errors = validateProductTypes(vocabulary, mapping);
    if (errors.length > 0) return failed(errors);
    return ok({
      vocabulary: vocabularySchema.parse(vocabulary),
      mapping: tipoMappingSchema.parse(mapping),
    });
  };

  const loadPaymentCards = (): Checked<PaymentCardTable> => {
    const input = readJson(PAYMENT_CARDS_PATH);
    const errors = validatePaymentCards(input);
    return errors.length > 0 ? failed(errors) : ok(paymentCardTableSchema.parse(input));
  };

  const loadEvalSet = (): Checked<CheckedEvalSet> => {
    const productTypes = loadProductTypes();
    if (!productTypes.ok) return productTypes;
    const { vocabulary } = productTypes.value;
    const input = readJson(ORDER_EVAL_SET_PATH);
    const errors = validateEvalSet(input, vocabulary);
    return errors.length > 0
      ? failed(errors)
      : ok({ evalSet: evalSetSchema.parse(input), vocabulary });
  };

  const loadOrderFiles = (): Checked<OrderFiles> => {
    const catalog = loadCatalog();
    const productTypes = loadProductTypes();
    const paymentCards = loadPaymentCards();
    if (!catalog.ok || !productTypes.ok || !paymentCards.ok) {
      return failed(
        [catalog, productTypes, paymentCards].flatMap((loaded) => (loaded.ok ? [] : loaded.errors)),
      );
    }
    const grocery = new Set<string>(GROCERY_DEPARTMENTS);
    return ok({
      catalog: catalog.value.filter((product) => grocery.has(product.department)),
      ...productTypes.value,
      paymentCards: paymentCards.value,
    });
  };

  const saveParts = (parts: Part[]) => {
    rmSync(at(PARTS_DIR), { recursive: true, force: true });
    mkdirSync(at(PARTS_DIR), { recursive: true });
    for (const part of parts)
      writeText(`${PARTS_DIR}/${part.id}.json`, JSON.stringify(part, null, 2));
  };

  const loadParts = (): Part[] => {
    if (!exists(PARTS_DIR)) return [];
    return readdirSync(at(PARTS_DIR))
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => readJson(`${PARTS_DIR}/${file}`) as Part);
  };

  const loadPart = (partId: string): Checked<Part> => {
    const path = `${PARTS_DIR}/${partId}.json`;
    return exists(path) ? ok(readJson(path) as Part) : failed([`Missing ${path}`]);
  };

  const hasProposal = (partId: string) => exists(`${PROPOSALS_DIR}/${partId}.json`);

  const loadProposal = (part: Part): Checked<Proposal> => {
    const path = `${PROPOSALS_DIR}/${part.id}.json`;
    if (!exists(path)) return failed([`Missing ${path}`]);
    const input = readJson(path);
    const errors = validateProposal(input, part);
    return errors.length > 0 ? failed(errors) : ok(proposalSchema.parse(input));
  };

  const loadDecisions = (): Checked<Decision[]> => {
    const decisions = decisionsSchema.safeParse(
      exists(DECISIONS_PATH) ? readJson(DECISIONS_PATH) : [],
    );
    if (decisions.success) return ok(decisions.data);
    return failed(
      decisions.error.issues.map(
        (issue) => `${DECISIONS_PATH} at "${issue.path.join(".")}": ${issue.message}`,
      ),
    );
  };

  const loadDoubts = (): Checked<RemainingDoubt[]> =>
    exists(DOUBTS_PATH)
      ? ok(readJson(DOUBTS_PATH) as RemainingDoubt[])
      : failed([`No ${DOUBTS_PATH}. Run pnpm seed:consolidate first.`]);

  const saveConsolidation = (consolidation: Consolidation): string[] => {
    writeText(VOCABULARY_PATH, writeJsonText(consolidation.vocabulary));
    writeText(CARREFOUR_MAPPING_PATH, writeJsonText(consolidation.mapping));
    writeText(DOUBTS_PATH, writeJsonText(consolidation.doubts));
    writeText(SUMMARY_PATH, renderSummary(consolidation));
    return [VOCABULARY_PATH, CARREFOUR_MAPPING_PATH, DOUBTS_PATH, SUMMARY_PATH];
  };

  const saveCatalog = ({ meta, products, tipos }: CatalogDownload, outputDir = CATALOG_DIR) => {
    const directory = resolve(root, outputDir);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "products.json"), JSON.stringify({ ...meta, products }, null, 2));
    writeFileSync(join(directory, "tipos.json"), JSON.stringify({ ...meta, tipos }, null, 2));
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

  const headCommit = (): string | null => {
    try {
      return execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
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
    loadCatalog,
    loadProductTypes,
    loadPaymentCards,
    loadEvalSet,
    loadOrderFiles,
    saveParts,
    loadParts,
    loadPart,
    hasProposal,
    loadProposal,
    loadDecisions,
    loadDoubts,
    saveConsolidation,
    saveCatalog,
    saveEvalRun,
    loadLatestEvalRun,
  };
}
