import { createInterface } from "node:readline/promises";
import { createClaudeCodeLlm, type LlmCall } from "../src/order-resolution/claude-code-llm.ts";
import {
  createOrderResolver,
  type OrderResolution,
} from "../src/order-resolution/resolve-order.ts";
import { createCarrefourStore } from "../src/product-selection/carrefour-store.ts";
import { pickProducts } from "../src/product-selection/pick-products.ts";
import { PROMPTS_DIR, readOrderData, renderItem } from "./order-files.ts";

const orderText = process.argv.slice(2).join(" ").trim();
if (!orderText) {
  console.error('Usage: pnpm order "<order text>"');
  process.exit(1);
}

const { products, vocabulary, mapping } = readOrderData();

const calls: LlmCall[] = [];
const llm = createClaudeCodeLlm({
  vocabulary,
  promptsDir: PROMPTS_DIR,
  onCall: (call) => calls.push(call),
});
const { resolveOrder, answerQuestions } = createOrderResolver({
  products,
  vocabulary,
  mapping,
  llm,
});

const started = Date.now();
const show = (resolution: OrderResolution) => {
  for (const item of resolution.items) console.log(`- ${renderItem(item)}`);
};

let resolution = await resolveOrder(orderText);
show(resolution);

const terminal = createInterface({ input: process.stdin });
const lines = terminal[Symbol.asyncIterator]();
while (resolution.message) {
  console.log(`\n${resolution.message}\n`);
  process.stdout.write("> ");
  const line = await lines.next();
  const answer = line.done ? "" : line.value.trim();
  if (!answer) break;
  resolution = await answerQuestions(resolution, answer);
  console.log("");
  show(resolution);
}
terminal.close();

if (!resolution.message) {
  const picked = Date.now();
  const selection = await pickProducts(resolution, { mapping, store: createCarrefourStore() });
  const money = (value: number) => `$${value.toFixed(2)}`;
  console.log(`\nCarrito (código postal ${resolution.postalCode}):\n`);
  for (const line of selection.lines) {
    const product = line.product
      ? `${line.product.name} (${line.product.itemId}) x${line.quantity}, ${money(line.unitPrice ?? 0)} c/u, ${money(line.total)}`
      : "sin producto";
    console.log(`- ${line.phrase}: ${product}. ${line.reason}`);
  }
  console.log(
    `\nTotal: ${money(selection.total)} (Carrefour, ${((Date.now() - picked) / 1000).toFixed(1)} s)`,
  );
}

const cost = calls.reduce((total, call) => total + call.costUsd, 0);
console.log(
  `\n${calls.length} Claude Code sessions, ${((Date.now() - started) / 1000).toFixed(1)} s, US$ ${cost.toFixed(4)}`,
);
