import { tipoMappingSchema, vocabularySchema } from "../src/product-types/schema.ts";
import { createClaudeCodeLlm, type LlmCall } from "../src/order-resolution/claude-code-llm.ts";
import { createOrderResolver } from "../src/order-resolution/resolve-order.ts";
import { GROCERY_DEPARTMENTS } from "../src/product-type-seed/split.ts";
import {
  CARREFOUR_MAPPING_PATH,
  VOCABULARY_PATH,
  readCatalogProducts,
  readJson,
} from "./seed-files.ts";

const PROMPTS_DIR = "prompts/order-resolution";

const orderText = process.argv.slice(2).join(" ").trim();
if (!orderText) {
  console.error('Usage: pnpm order "<order text>"');
  process.exit(1);
}

const grocery = new Set<string>(GROCERY_DEPARTMENTS);
const products = readCatalogProducts()
  .filter((product) => grocery.has(product.department))
  .map((product) => ({ name: product.name, brand: product.brand ?? null, tipo: product.tipo }));
const vocabulary = vocabularySchema.parse(readJson(VOCABULARY_PATH));
const mapping = tipoMappingSchema.parse(readJson(CARREFOUR_MAPPING_PATH));

const calls: LlmCall[] = [];
const llm = createClaudeCodeLlm({
  vocabulary,
  promptsDir: PROMPTS_DIR,
  onCall: (call) => calls.push(call),
});
const resolveOrder = createOrderResolver({ products, vocabulary, mapping, llm });

const started = Date.now();
const resolution = await resolveOrder(orderText);

for (const item of resolution.items) {
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
  console.log(`- ${item.phrase}${details ? ` [${details}]` : ""} → ${outcome}`);
}
const cost = calls.reduce((total, call) => total + call.costUsd, 0);
console.log(
  `${calls.length} Claude Code sessions, ${((Date.now() - started) / 1000).toFixed(1)} s, US$ ${cost.toFixed(4)}`,
);
