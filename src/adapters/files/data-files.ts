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
import type { ConversationEvent } from "../../core/conversation-log/conversation-log.ts";
import {
  catalogProductsFrom,
  type CatalogProduct,
} from "../../core/order-matching/catalog-product.ts";
import {
  validateEvalSet,
  evalSetSchema,
  type EvalSet,
} from "../../core/order-resolution/eval-set.ts";
import type { EvalRun } from "../../core/order-resolution/eval-run.ts";
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
export const VOCABULARY_PATH = "vocabulary/product-types.json";
export const CARREFOUR_MAPPING_PATH = "vocabulary/carrefour-tipos.json";
export const ORDER_EVAL_SET_PATH = "evals/order-resolution.json";
export const ORDER_EVAL_RUNS_DIR = ".data/order-resolution/eval-runs";
export const PROMPTS_DIR = "prompts";
export const CONVERSATIONS_DIR = ".data/conversations";

const GROCERY_DEPARTMENTS = [
  "Almacén",
  "Desayuno y merienda",
  "Bebidas",
  "Lácteos y productos frescos",
  "Carnes y pescados",
  "Frutas y verduras",
  "Panadería",
  "Congelados",
  "Limpieza",
  "Perfumería y farmacia",
];

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
  cases: z.array(z.object({ id: z.string(), outcome: z.enum(["hit", "miss", "error"]) })),
});

export type CatalogRecord = z.infer<typeof catalogSchema>["products"][number];

export type ProductTypes = { vocabulary: Vocabulary; mapping: TipoMapping };

export type OrderFiles = ProductTypes & { catalog: CatalogRecord[] };

export type CheckedEvalSet = { evalSet: EvalSet; vocabulary: Vocabulary };

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
    if (!catalog.ok || !productTypes.ok) {
      return failed([catalog, productTypes].flatMap((loaded) => (loaded.ok ? [] : loaded.errors)));
    }
    const grocery = new Set<string>(GROCERY_DEPARTMENTS);
    return ok({
      catalog: catalog.value.filter((product) => grocery.has(product.department)),
      ...productTypes.value,
    });
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
    loadCatalog,
    loadCatalogProducts,
    loadProductTypes,
    loadEvalSet,
    loadOrderFiles,
    saveCatalog,
    saveEvalRun,
    loadLatestEvalRun,
  };
}
