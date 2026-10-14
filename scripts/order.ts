import { createInterface } from "node:readline/promises";
import { createClaudeCodeLlm, type LlmCall } from "../src/order-resolution/claude-code-llm.ts";
import {
  createOrderResolver,
  type OrderResolution,
} from "../src/order-resolution/resolve-order.ts";
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

const cost = calls.reduce((total, call) => total + call.costUsd, 0);
console.log(
  `\n${calls.length} Claude Code sessions, ${((Date.now() - started) / 1000).toFixed(1)} s, US$ ${cost.toFixed(4)}`,
);
