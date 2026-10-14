import { tipoMappingSchema, vocabularySchema } from "../src/product-types/schema.ts";
import type { CatalogProduct, OrderResolution } from "../src/order-resolution/resolve-order.ts";
import { snapshotProducts } from "../src/product-selection/carrefour-store.ts";
import { paymentCardTableSchema } from "../src/product-selection/payment-cards.ts";
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
export const PAYMENT_CARDS_PATH = "vocabulary/carrefour-payment-cards.json";

export const readVocabulary = () => vocabularySchema.parse(readJson(VOCABULARY_PATH));

export function readOrderData() {
  const grocery = new Set<string>(GROCERY_DEPARTMENTS);
  const catalog = readCatalogProducts().filter((product) => grocery.has(product.department));
  const products: CatalogProduct[] = catalog.map((product) => ({
    name: product.name,
    brand: product.brand ?? null,
    tipo: product.tipo,
    inStock: product.availableQuantity > 0,
  }));
  const mapping = tipoMappingSchema.parse(readJson(CARREFOUR_MAPPING_PATH));
  return {
    products,
    snapshot: snapshotProducts(
      [...catalog].sort(
        (a, b) => Number(b.availableQuantity > 0) - Number(a.availableQuantity > 0),
      ),
    ),
    vocabulary: readVocabulary(),
    mapping,
    paymentCards: paymentCardTableSchema.parse(readJson(PAYMENT_CARDS_PATH)),
  };
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
  const types = item.productTypes.map(({ id, name }) => `${name} \`${id}\``).join(" o ");
  const { question } = item;
  const asked =
    question === null
      ? null
      : question.kind === "productType"
        ? `asks ${question.reason}: ${question.options.map(({ id }) => id).join(", ")}`
        : question.kind === "size"
          ? `asks size: ${question.options.join(", ")}`
          : question.kind === "term"
            ? `asks term "${question.term}"`
            : "asks what it means";
  const outcome = [types, asked].filter(Boolean).join("; ");
  return `${item.phrase}${details ? ` [${details}]` : ""} → ${outcome}`;
}
