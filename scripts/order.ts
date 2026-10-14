import { createClaudeCodeLlm, type LlmCall } from "../src/order-resolution/claude-code-llm.ts";
import { createOrderResolver } from "../src/order-resolution/resolve-order.ts";
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
const resolveOrder = createOrderResolver({ products, vocabulary, mapping, llm });

const started = Date.now();
const resolution = await resolveOrder(orderText);

for (const item of resolution.items) console.log(`- ${renderItem(item)}`);
const cost = calls.reduce((total, call) => total + call.costUsd, 0);
console.log(
  `${calls.length} Claude Code sessions, ${((Date.now() - started) / 1000).toFixed(1)} s, US$ ${cost.toFixed(4)}`,
);
