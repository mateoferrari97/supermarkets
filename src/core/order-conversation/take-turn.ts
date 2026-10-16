import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { ParseOrderLlm } from "../order-matching/item.ts";
import { matchItems, type FitProductsLlm } from "../order-matching/match-items.ts";
import { checkedReadReply, type ReadReplyLlm } from "../order-matching/read-reply.ts";
import { CART_WARNING, simulateCart, type CartLine } from "../product-selection/cart.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { postalCodeFrom } from "../product-selection/postal-code.ts";
import {
  applyReply,
  boughtItem,
  nextStep,
  replyItems,
  startOrder,
  withMatches,
  type AskedQuestion,
  type Mark,
  type Order,
  type OrderItem,
} from "./order.ts";
import { stepsFrom, type OnStep, type Steps } from "./steps.ts";

export type { AskedQuestion, Mark };

export const POSTAL_CODE_QUESTION = "¿A qué código postal es el envío?";
export const ORDER_QUESTION = "¿Qué necesitás del súper?";
export const IGNORED_PREFERENCE_NOTE = "Por ahora no tengo en cuenta tarjetas ni preferencias.";

export type CartLineShown = CartLine & { mark: Mark | null };

export type Cart = {
  postalCode: string;
  lines: CartLineShown[];
  total: number;
  notes: string[];
  warning: string;
  cartLink: string | null;
};

export type ConversationState =
  | { stage: "postal-code" }
  | { stage: "order"; postalCode: string }
  | ({ stage: "questions" } & Order)
  | ({ stage: "cart" } & Order);

export const NEW_CONVERSATION: ConversationState = { stage: "postal-code" };

export type Reply =
  | { kind: "ask"; text: string }
  | { kind: "questions"; text: string; questions: AskedQuestion[] }
  | { kind: "cart"; cart: Cart };

export type Turn = { state: ConversationState; reply: Reply };

export type ConversationDependencies = {
  llm: ParseOrderLlm & FitProductsLlm & ReadReplyLlm;
  search: CatalogSearch;
  store: OnlineStore;
  signal?: AbortSignal;
};

export async function takeTurn(
  state: ConversationState,
  replyText: string,
  deps: ConversationDependencies,
  onStep?: OnStep,
): Promise<Turn> {
  const signal = deps.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const reply = replyText.trim();
  const turn = await turnFor(state, reply, deps, stepsFrom({ signal, onStep }));
  signal.throwIfAborted();
  return turn;
}

async function turnFor(
  state: ConversationState,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  switch (state.stage) {
    case "postal-code":
      return postalCodeTurn(reply, deps.store, steps.signal);
    case "order":
      if (!reply) return ask(state, ORDER_QUESTION);
      return orderTurn(state, reply, deps, steps);
    case "questions":
    case "cart": {
      const { stage: _stage, ...order } = state;
      if (!reply) return nextTurn(order, deps, steps);
      return replyTurn(order, reply, deps, steps);
    }
  }
}

async function postalCodeTurn(reply: string, store: OnlineStore, signal: AbortSignal) {
  const state: ConversationState = { stage: "postal-code" };
  if (!reply) return ask(state, POSTAL_CODE_QUESTION);
  const postalCode = postalCodeFrom(reply);
  const delivery =
    postalCode === null ? "postal-code-rejected" : await store.checkDelivery(postalCode, signal);
  if (postalCode !== null && delivery === "delivers") {
    return ask({ stage: "order", postalCode }, ORDER_QUESTION);
  }
  const refusal =
    delivery === "does-not-deliver"
      ? `Carrefour no entrega en el código postal ${postalCode}.`
      : `"${reply}" no es un código postal válido.`;
  return ask(state, `${refusal} ${POSTAL_CODE_QUESTION}`);
}

async function orderTurn(
  state: { postalCode: string },
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const { items, ignoredPreference } = await steps.run({ kind: "understand-order" }, () =>
    deps.llm.parseOrder(reply, steps.signal),
  );
  const matched = await matchItems(items, deps, steps);
  return nextTurn(startOrder(state.postalCode, matched, ignoredPreference), deps, steps);
}

async function replyTurn(
  order: Order,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const read = await steps.run({ kind: "understand-answer" }, () =>
    checkedReadReply(deps.llm, { items: replyItems(order), reply }, steps.signal),
  );
  const applied = applyReply(order, read);
  const matched = await matchItems(applied.toMatch, deps, steps);
  return nextTurn(withMatches(applied.order, matched), deps, steps);
}

async function nextTurn(
  order: Order,
  { store }: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const next = nextStep(order);
  if (next.kind === "questions") {
    return {
      state: { stage: "questions", ...order },
      reply: { kind: "questions", text: next.text, questions: next.questions },
    };
  }
  const simulated = await steps.run({ kind: "simulate-cart" }, () =>
    simulateCart(
      next.items.map(({ toBuy }) => toBuy),
      order.postalCode,
      store,
      steps.signal,
    ),
  );
  const lines: CartLineShown[] = [];
  const inCart: OrderItem[] = [];
  const notGot: string[] = [];
  for (const [index, result] of simulated.bought.entries()) {
    const toBuy = next.items[index]!;
    if (result.kind === "not-got") {
      notGot.push(result.note);
      continue;
    }
    const { line } = result;
    const candidate = toBuy.toBuy.candidates.find(
      ({ product, quantity }) =>
        product.itemId === line.product.itemId && quantity === line.quantity,
    )!;
    const shown =
      toBuy.keptReason === null
        ? { ...line, mark: toBuy.mark }
        : { ...line, reason: toBuy.keptReason, notes: [], mark: null };
    lines.push(shown);
    inCart.push(boughtItem(toBuy, candidate, shown.reason));
  }
  const cart: Cart = {
    postalCode: order.postalCode,
    lines,
    total: simulated.total,
    notes: [
      ...order.dropped,
      ...notGot,
      ...order.removed,
      ...(order.ignoredPreference ? [IGNORED_PREFERENCE_NOTE] : []),
    ],
    warning: CART_WARNING,
    cartLink: simulated.cartLink,
  };
  return {
    state: {
      stage: "cart",
      postalCode: order.postalCode,
      items: inCart,
      dropped: [],
      removed: [],
      ignoredPreference: false,
      cartShown: true,
    },
    reply: { kind: "cart", cart },
  };
}

function ask(state: ConversationState, text: string): Turn {
  return { state, reply: { kind: "ask", text } };
}
