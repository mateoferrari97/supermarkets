import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Part } from "../src/product-type-seed/split.ts";

export const CATALOG_PATH = ".data/carrefour/products.json";
export const SEED_DIR = ".data/carrefour/seed";
export const PARTS_DIR = `${SEED_DIR}/parts`;
export const PROPOSALS_DIR = `${SEED_DIR}/proposals`;
export const DECISIONS_PATH = `${SEED_DIR}/decisions.json`;
export const DOUBTS_PATH = `${SEED_DIR}/doubts.json`;
export const SUMMARY_PATH = `${SEED_DIR}/summary.md`;
export const VOCABULARY_PATH = "vocabulary/product-types.json";
export const CARREFOUR_MAPPING_PATH = "vocabulary/carrefour-tipos.json";

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

export const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

export const writeJsonText = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export function readCatalogProducts() {
  if (!existsSync(CATALOG_PATH)) {
    console.error(`No Catalog Snapshot at ${CATALOG_PATH}. Run pnpm carrefour:catalog first.`);
    process.exit(1);
  }
  return catalogSchema.parse(readJson(CATALOG_PATH)).products;
}

export function readParts(): Part[] {
  if (!existsSync(PARTS_DIR)) return [];
  return readdirSync(PARTS_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => readJson(join(PARTS_DIR, file)) as Part);
}
