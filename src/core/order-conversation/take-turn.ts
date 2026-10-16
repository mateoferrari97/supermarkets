import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { ParseOrderLlm } from "../order-matching/item.ts";
import { matchItems, type FitProductsLlm } from "../order-matching/match-items.ts";
import { checkedReadReply, type ReadReplyLlm } from "../order-matching/read-reply.ts";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { Plan, PlanLlm, PlanMessage, PlanShown } from "../planning/plan.ts";
import { planWithSearches } from "../planning/plan-searches.ts";
import type { RouteMessageLlm } from "../planning/route-message.ts";
import { simulateCart } from "../product-selection/cart.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { postalCodeFrom } from "../product-selection/postal-code.ts";
import {
  applyReply,
  nextStep,
  replyItems,
  startOrder,
  takeCart,
  withMatches,
  type AskedQuestion,
  type Cart,
  type CartLineShown,
  type Mark,
  type Order,
} from "./order.ts";
import { stepsFrom, type OnStep, type Steps } from "./steps.ts";

export type { AskedQuestion, Cart, CartLineShown, Mark, PlanShown };

export const POSTAL_CODE_QUESTION = "¿A qué código postal es el envío?";
export const ORDER_QUESTION = "¿Qué necesitás del súper?";
export const OFF_TOPIC_TEXT =
  "Puedo ayudarte con compras del súper: pedidos, recetas, comidas de la semana, eventos y regalos de Carrefour. ¿Qué necesitás?";

export type ConversationState =
  | { stage: "postal-code" }
  | { stage: "order"; postalCode: string }
  | Planning
  | ({ stage: "questions" } & Order)
  | ({ stage: "cart" } & Order);

export type Planning = {
  stage: "planning";
  postalCode: string;
  messages: PlanMessage[];
  products: CatalogProduct[];
  lastPlan: Plan | null;
};

export const NEW_CONVERSATION: ConversationState = { stage: "postal-code" };

export type Reply =
  | { kind: "ask"; text: string }
  | { kind: "questions"; text: string; questions: AskedQuestion[] }
  | { kind: "plan"; message: string; plan: PlanShown }
  | { kind: "cart"; cart: Cart };

export type Turn = { state: ConversationState; reply: Reply };

export type ConversationDependencies = {
  llm: RouteMessageLlm & ParseOrderLlm & FitProductsLlm & ReadReplyLlm & PlanLlm;
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
      return firstMessageTurn(state, reply, deps, steps);
    case "planning":
      if (!reply) return ask(state, ORDER_QUESTION);
      return planningTurn(state, reply, deps, steps);
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

async function firstMessageTurn(
  state: { stage: "order"; postalCode: string },
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const { topic } = await steps.run({ kind: "understand-message" }, () =>
    deps.llm.routeMessage(reply, steps.signal),
  );
  if (topic === "plan") {
    const planning: Planning = {
      stage: "planning",
      postalCode: state.postalCode,
      messages: [],
      products: [],
      lastPlan: null,
    };
    return planningTurn(planning, reply, deps, steps);
  }
  if (topic !== "order") return ask(state, OFF_TOPIC_TEXT);
  return orderTurn(state, reply, deps, steps);
}

async function planningTurn(
  state: Planning,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const messages: PlanMessage[] = [...state.messages, { role: "owner", text: reply }];
  const { output, products } = await planWithSearches(
    { messages, products: state.products, lastPlan: state.lastPlan },
    deps,
    steps,
  );
  const next: Planning = {
    ...state,
    messages: [...messages, { role: "planner", text: output.message }],
    products,
    lastPlan: output.plan?.plan ?? state.lastPlan,
  };
  if (output.plan === null) return ask(next, output.message);
  return { state: next, reply: { kind: "plan", message: output.message, plan: output.plan } };
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
  const { state, cart } = takeCart(order, simulated);
  return { state, reply: { kind: "cart", cart } };
}

function ask(state: ConversationState, text: string): Turn {
  return { state, reply: { kind: "ask", text } };
}
