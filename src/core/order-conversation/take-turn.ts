import type { Llm } from "../order-resolution/llm.ts";
import {
  createOrderResolver,
  type OrderDependencies,
  type OrderItem,
  type OrderResolution,
} from "../order-resolution/resolve-order.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import {
  pickProducts,
  type PickDependencies,
  type ProductSelection,
} from "../product-selection/pick-products.ts";
import { postalCodeFrom } from "../product-selection/postal-code.ts";
import type { OnStep } from "./steps.ts";

export const POSTAL_CODE_QUESTION = "¿A qué código postal es el envío?";
export const ORDER_QUESTION = "¿Qué necesitás del súper?";

export type ConversationState =
  | { stage: "postal-code" }
  | { stage: "order"; postalCode: string }
  | { stage: "questions"; postalCode: string; resolution: OrderResolution }
  | { stage: "done"; postalCode: string; selection: ProductSelection };

export const NEW_CONVERSATION: ConversationState = { stage: "postal-code" };

export type Reply =
  | { kind: "ask"; text: string }
  | { kind: "questions"; text: string; items: OrderItem[] }
  | { kind: "selection"; selection: ProductSelection; paymentCard: string | null };

export type Turn = { state: ConversationState; reply: Reply };

export type ConversationDependencies = Omit<OrderDependencies, "llm"> &
  Omit<PickDependencies, "llm" | "store"> & {
    llm: Llm;
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
  const turn = await turnFor(state, reply, deps, { signal, onStep });
  signal.throwIfAborted();
  return turn;
}

type TurnOptions = { signal: AbortSignal; onStep: OnStep | undefined };

async function turnFor(
  state: ConversationState,
  reply: string,
  deps: ConversationDependencies,
  options: TurnOptions,
): Promise<Turn> {
  switch (state.stage) {
    case "postal-code":
      return postalCodeTurn(reply, deps.store, options.signal);
    case "order": {
      if (!reply) return ask(state, ORDER_QUESTION);
      const resolution = await createOrderResolver(deps).resolveOrder(reply, options);
      return resolved(state.postalCode, resolution, deps, options);
    }
    case "questions": {
      if (!reply) return questions(state, state.resolution);
      const resolution = await createOrderResolver(deps).answerQuestions(
        state.resolution,
        reply,
        options,
      );
      return resolved(state.postalCode, resolution, deps, options);
    }
    case "done":
      throw new Error("The conversation already delivered its Product Selection");
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

async function resolved(
  postalCode: string,
  resolution: OrderResolution,
  deps: ConversationDependencies,
  options: TurnOptions,
): Promise<Turn> {
  if (resolution.message !== null) {
    return questions({ stage: "questions", postalCode, resolution }, resolution);
  }
  const selection = await pickProducts(resolution, postalCode, deps, options);
  return {
    state: { stage: "done", postalCode, selection },
    reply: { kind: "selection", selection, paymentCard: resolution.paymentCard },
  };
}

function ask(state: ConversationState, text: string): Turn {
  return { state, reply: { kind: "ask", text } };
}

function questions(state: ConversationState, resolution: OrderResolution): Turn {
  return {
    state,
    reply: { kind: "questions", text: resolution.message ?? "", items: resolution.items },
  };
}
