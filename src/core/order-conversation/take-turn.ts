import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Item, ParseOrderLlm } from "../order-matching/item.ts";
import { matchItems, type FitProductsLlm, type ItemMatch } from "../order-matching/match-items.ts";
import { candidatesFor } from "../product-selection/candidates.ts";
import {
  CART_WARNING,
  simulateCart,
  type CartLine,
  type ItemToBuy,
} from "../product-selection/cart.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { postalCodeFrom } from "../product-selection/postal-code.ts";
import { stepsFrom, type OnStep, type Steps } from "./steps.ts";

export const POSTAL_CODE_QUESTION = "¿A qué código postal es el envío?";
export const ORDER_QUESTION = "¿Qué necesitás del súper?";
export const IGNORED_PREFERENCE_NOTE = "Por ahora no tengo en cuenta tarjetas ni preferencias.";

export type Cart = {
  postalCode: string;
  lines: CartLine[];
  total: number;
  notes: string[];
  warning: string;
  cartLink: string | null;
};

export type ConversationState =
  | { stage: "postal-code" }
  | { stage: "order"; postalCode: string }
  | { stage: "done"; postalCode: string; cart: Cart };

export const NEW_CONVERSATION: ConversationState = { stage: "postal-code" };

export type Reply = { kind: "ask"; text: string } | { kind: "cart"; cart: Cart };

export type Turn = { state: ConversationState; reply: Reply };

export type ConversationDependencies = {
  llm: ParseOrderLlm & FitProductsLlm;
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
  const turn = await turnFor(state, reply, deps, stepsFrom({ signal, onStep }), onStep);
  signal.throwIfAborted();
  return turn;
}

async function turnFor(
  state: ConversationState,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
  onStep: OnStep | undefined,
): Promise<Turn> {
  switch (state.stage) {
    case "postal-code":
      return postalCodeTurn(reply, deps.store, steps.signal);
    case "order": {
      if (!reply) return ask(state, ORDER_QUESTION);
      const cart = await orderTurn(state.postalCode, reply, deps, steps, onStep);
      return {
        state: { stage: "done", postalCode: state.postalCode, cart },
        reply: { kind: "cart", cart },
      };
    }
    case "done":
      throw new Error("The conversation already delivered its cart");
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

type Wanted = { kind: "buy"; item: ItemToBuy } | { kind: "not-got"; note: string };

async function orderTurn(
  postalCode: string,
  reply: string,
  { llm, search, store }: ConversationDependencies,
  steps: Steps,
  onStep: OnStep | undefined,
): Promise<Cart> {
  const { signal } = steps;
  const { items, ignoredPreference } = await steps.run({ kind: "understand-order" }, () =>
    llm.parseOrder(reply, signal),
  );
  const matched = await matchItems(items, { search, llm }, { signal, onStep });
  const wanted = matched.map(wantedOf);
  const toBuy = wanted.flatMap((entry) => (entry.kind === "buy" ? [entry.item] : []));
  const simulated = await steps.run({ kind: "simulate-cart" }, () =>
    simulateCart(toBuy, postalCode, store, signal),
  );
  const bought = [...simulated.bought];
  const lines: CartLine[] = [];
  const notGot: string[] = [];
  for (const entry of wanted) {
    const result = entry.kind === "buy" ? bought.shift()! : entry;
    if (result.kind === "bought") lines.push(result.line);
    else notGot.push(result.note);
  }
  return {
    postalCode,
    lines,
    total: simulated.total,
    notes: [...notGot, ...(ignoredPreference ? [IGNORED_PREFERENCE_NOTE] : [])],
    warning: CART_WARNING,
    cartLink: simulated.cartLink,
  };
}

function wantedOf({ item, fits, note, question }: ItemMatch): Wanted {
  if (question !== null) return { kind: "not-got", note: noFitNote(item, question.text) };
  return {
    kind: "buy",
    item: { original: item.original, note, candidates: candidatesFor(item, fits) },
  };
}

function noFitNote(item: Item, question: string): string {
  return `No conseguí "${item.original}": ${question}`;
}

function ask(state: ConversationState, text: string): Turn {
  return { state, reply: { kind: "ask", text } };
}
