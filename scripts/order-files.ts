import { tipoMappingSchema, vocabularySchema } from "../src/product-types/schema.ts";
import type { CatalogProduct, OrderResolution } from "../src/order-resolution/resolve-order.ts";
import { GROCERY_DEPARTMENTS } from "../src/product-type-seed/split.ts";
import {
  CARREFOUR_MAPPING_PATH,
  VOCABULARY_PATH,
  readCatalogProducts,
  readJson,
} from "./seed-files.ts";

export const PROMPTS_DIR = "prompts/order-resolution";
export const ORDER_EVAL_SET_PATH = "evals/order-resolution.json";
export const ORDER_EVAL_RUNS_DIR = ".data/order-resolution/eval-runs";

export const readVocabulary = () => vocabularySchema.parse(readJson(VOCABULARY_PATH));

export function readOrderData() {
  const grocery = new Set<string>(GROCERY_DEPARTMENTS);
  const products: CatalogProduct[] = readCatalogProducts()
    .filter((product) => grocery.has(product.department))
    .map((product) => ({ name: product.name, brand: product.brand ?? null, tipo: product.tipo }));
  const mapping = tipoMappingSchema.parse(readJson(CARREFOUR_MAPPING_PATH));
  return { products, vocabulary: readVocabulary(), mapping };
}

export function renderItem(item: OrderResolution["items"][number]): string {
  const details = [
    item.quantity === null ? null : `x${item.quantity}`,
    item.brand ? `brand ${item.brand}` : null,
    item.terms.length > 0 ? `terms ${item.terms.join(", ")}` : null,
    item.vagueWords.length > 0 ? `vague ${item.vagueWords.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("; ");
  const outcome =
    item.status === "resolved"
      ? `${item.productType.name} \`${item.productType.id}\``
      : `pending (${item.reason}): ${item.candidates.map(({ id }) => id).join(", ") || "no candidates"}`;
  return `${item.phrase}${details ? ` [${details}]` : ""} → ${outcome}`;
}
