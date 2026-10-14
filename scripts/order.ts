import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  createOrderResolver,
  type OrderResolution,
} from "../src/core/order-resolution/resolve-order.ts";
import { createLlm, createOnlineStore, loadOrderData, type LlmCall } from "../src/compose.ts";
import { pickProducts } from "../src/core/product-selection/pick-products.ts";
import { postalCodeFrom } from "../src/core/product-selection/postal-code.ts";
import { renderItem } from "../src/cli/render-item.ts";
import { valueOf } from "../src/cli/report.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "postal-code": { type: "string" } },
});
const orderText = positionals.join(" ").trim();
if (!orderText) {
  console.error('Usage: pnpm order [--postal-code <code>] "<order text>"');
  process.exit(1);
}

const store = createOnlineStore();
const terminal = createInterface({ input: process.stdin });
const lines = terminal[Symbol.asyncIterator]();
const ask = async (question: string) => {
  console.log(`\n${question}\n`);
  process.stdout.write("> ");
  const line = await lines.next();
  return line.done ? "" : line.value.trim();
};

const POSTAL_CODE_QUESTION = "¿A qué código postal es el envío?";
let postalCode: string | null = null;
let written = values["postal-code"]?.trim() ?? "";
if (!written) written = await ask(POSTAL_CODE_QUESTION);
while (postalCode === null && written) {
  const candidate = postalCodeFrom(written);
  const delivery =
    candidate === null ? "postal-code-rejected" : await store.checkDelivery(candidate);
  if (delivery === "delivers") {
    postalCode = candidate;
    continue;
  }
  const refusal =
    delivery === "does-not-deliver"
      ? `Carrefour no entrega en el código postal ${candidate}.`
      : `"${written}" no es un código postal válido.`;
  written = await ask(`${refusal} ${POSTAL_CODE_QUESTION}`);
}
if (postalCode === null) {
  console.log("\nSin código postal no puedo armar el pedido.");
  terminal.close();
  process.exit(1);
}

const { products, snapshot, vocabulary, mapping, paymentCards } = valueOf(loadOrderData());

const calls: LlmCall[] = [];
const llm = createLlm({
  vocabulary,
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

while (resolution.message) {
  const answer = await ask(resolution.message);
  if (!answer) break;
  resolution = await answerQuestions(resolution, answer);
  console.log("");
  show(resolution);
}
terminal.close();

if (!resolution.message) {
  const picked = Date.now();
  const selection = await pickProducts(resolution, postalCode, {
    mapping,
    store,
    llm,
    paymentCards,
    snapshot,
  });
  const money = (value: number) => `$${value.toFixed(2)}`;
  const card = resolution.paymentCard ? `, pago con ${resolution.paymentCard}` : "";
  console.log(`\nCarrito (código postal ${selection.postalCode}${card}):\n`);
  for (const line of selection.lines) {
    const product = line.product
      ? `${line.product.name} (${line.product.itemId}) x${line.quantity}, ${money(line.unitPrice ?? 0)} c/u, ${money(line.total)}`
      : "sin producto";
    console.log(`- ${line.phrase}: ${product}. ${line.reason}`);
    for (const notice of line.notices) console.log(`  ${notice}`);
  }
  for (const notice of selection.notices) console.log(`\n${notice}`);
  if (selection.unexpressed.length > 0) {
    console.log(`\nNo pude aplicar: ${selection.unexpressed.join("; ")}.`);
  }
  if (selection.cartLink) console.log(`\nLink del carrito: ${selection.cartLink}`);
  console.log(
    `\nTotal: ${money(selection.total)} (Carrefour, ${((Date.now() - picked) / 1000).toFixed(1)} s)`,
  );
}

const cost = calls.reduce((total, call) => total + call.costUsd, 0);
console.log(
  `\n${calls.length} Claude Code sessions, ${((Date.now() - started) / 1000).toFixed(1)} s, US$ ${cost.toFixed(4)}`,
);
