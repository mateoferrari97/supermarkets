import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Item, ParseOrderLlm } from "../order-matching/item.ts";
import {
  matchItems,
  type FitProductsLlm,
  type ItemMatch,
  type Question,
} from "../order-matching/match-items.ts";
import type { ReadReplyLlm } from "../order-matching/read-reply.ts";
import { candidateOf, candidatesFor } from "../product-selection/candidates.ts";
import {
  CART_WARNING,
  money,
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
  | ({ stage: "questions" } & Order)
  | { stage: "done"; postalCode: string; cart: Cart };

export const NEW_CONVERSATION: ConversationState = { stage: "postal-code" };

export type AskedQuestion = { number: number; options: string[] };

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
    case "order":
      if (!reply) return ask(state, ORDER_QUESTION);
      return orderTurn(state, reply, deps, steps, onStep);
    case "questions":
      if (!reply) return nextTurn(state, deps, steps);
      return questionsTurn(state, reply, deps, steps, onStep);
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

export const MAX_QUESTIONS = 2;

export type TurnItem =
  | { kind: "ready"; toBuy: ItemToBuy }
  | {
      kind: "asked";
      item: Item;
      question: Question;
      questionsSpent: number;
      reasked: boolean;
    };

type Order = {
  postalCode: string;
  items: TurnItem[];
  dropped: string[];
  removed: string[];
  ignoredPreference: boolean;
};

async function orderTurn(
  state: { postalCode: string },
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
  onStep: OnStep | undefined,
): Promise<Turn> {
  const { items, ignoredPreference } = await steps.run({ kind: "understand-order" }, () =>
    deps.llm.parseOrder(reply, steps.signal),
  );
  const matched = await matchItems(items, deps, { signal: steps.signal, onStep });
  const order: Order = {
    postalCode: state.postalCode,
    items: matched.map((match) => turnItemOf(match, 0)),
    dropped: [],
    removed: [],
    ignoredPreference,
  };
  return nextTurn(order, deps, steps);
}

async function questionsTurn(
  order: Order,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
  onStep: OnStep | undefined,
): Promise<Turn> {
  const asked = order.items.filter((entry) => entry.kind === "asked");
  const read = await steps.run({ kind: "understand-answer" }, () =>
    deps.llm.readReply(
      {
        items: asked.map(({ item, question }) => ({
          kind: "asked",
          original: item.original,
          question,
        })),
        reply,
      },
      steps.signal,
    ),
  );
  const entryOf = new Map(read.entries.map((entry) => [asked[entry.item - 1], entry]));
  const toMatch: { item: Item; questionsSpent: number }[] = [];
  const dropped = [...order.dropped];
  const removed = [...order.removed];
  const kept: (TurnItem | { kind: "match"; from: number; count: number })[] = [];
  for (const current of order.items) {
    if (current.kind === "ready") {
      kept.push(current);
      continue;
    }
    const entry = entryOf.get(current) ?? { kind: "unanswered", question: null };
    switch (entry.kind) {
      case "choice":
        kept.push({
          kind: "ready",
          toBuy: {
            original: current.item.original,
            note: null,
            candidates: [
              candidateOf(current.item, current.question.alternatives[entry.alternative - 1]!),
            ],
          },
        });
        break;
      case "lines":
        kept.push({ kind: "match", from: toMatch.length, count: entry.lines.length });
        toMatch.push(
          ...entry.lines.map((item) => ({ item, questionsSpent: current.questionsSpent })),
        );
        break;
      case "drop":
        removed.push(removedNote(current.item));
        break;
      case "unanswered":
        if (current.questionsSpent >= MAX_QUESTIONS) dropped.push(droppedNote(current.item));
        else kept.push({ ...current, questionsSpent: current.questionsSpent + 1, reasked: true });
        break;
    }
  }
  const added = read.newLines.map((item) => ({ item, questionsSpent: 0 }));
  const matched = await matchItems(
    [...toMatch, ...added].map(({ item }) => item),
    deps,
    { signal: steps.signal, onStep },
  );
  const spentOf = [...toMatch, ...added].map(({ questionsSpent }) => questionsSpent);
  const fromMatch = (from: number, count: number) =>
    matched.slice(from, from + count).flatMap((match, offset): TurnItem[] => {
      const questionsSpent = spentOf[from + offset]!;
      if (match.question !== null && questionsSpent >= MAX_QUESTIONS) {
        dropped.push(droppedNote(match.item));
        return [];
      }
      return [turnItemOf(match, questionsSpent)];
    });
  const items = [
    ...kept.flatMap((entry) =>
      entry.kind === "match" ? fromMatch(entry.from, entry.count) : [entry],
    ),
    ...fromMatch(toMatch.length, added.length),
  ];
  return nextTurn(
    {
      postalCode: order.postalCode,
      items,
      dropped,
      removed,
      ignoredPreference: order.ignoredPreference || read.ignoredPreference,
    },
    deps,
    steps,
  );
}

function turnItemOf({ item, fits, note, question }: ItemMatch, questionsSpent: number): TurnItem {
  if (question === null) {
    return {
      kind: "ready",
      toBuy: { original: item.original, note, candidates: candidatesFor(item, fits) },
    };
  }
  return { kind: "asked", item, question, questionsSpent: questionsSpent + 1, reasked: false };
}

async function nextTurn(
  order: Order,
  { store }: ConversationDependencies,
  steps: Steps,
): Promise<Turn> {
  const asked = order.items.filter((entry) => entry.kind === "asked");
  if (asked.length > 0) {
    return {
      state: { stage: "questions", ...order },
      reply: {
        kind: "questions",
        text: questionsText(asked),
        questions: asked.map(({ question }, index) => ({
          number: index + 1,
          options: question.alternatives.map(({ name }) => name),
        })),
      },
    };
  }
  const toBuy = order.items.flatMap((entry) => (entry.kind === "ready" ? [entry.toBuy] : []));
  const simulated = await steps.run({ kind: "simulate-cart" }, () =>
    simulateCart(toBuy, order.postalCode, store, steps.signal),
  );
  const lines: CartLine[] = [];
  const notGot: string[] = [];
  for (const result of simulated.bought) {
    if (result.kind === "bought") lines.push(result.line);
    else notGot.push(result.note);
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
    state: { stage: "done", postalCode: order.postalCode, cart },
    reply: { kind: "cart", cart },
  };
}

export const QUESTIONS_HINT =
  'Respondé con el número ("la 2"), con otro producto o marca ("dale, una Patagonia") o "sacala".';

function questionsText(asked: (TurnItem & { kind: "asked" })[]): string {
  const intro = asked.length === 1 ? "Tengo una pregunta:" : "Tengo unas preguntas:";
  const questions = asked.map(({ item, question, reasked }, index) => {
    const text = reasked ? `Me falta saber de ${item.original}: ${question.text}` : question.text;
    const alternatives = question.alternatives.map(
      ({ name, price }, number) =>
        `   ${number + 1}) ${name}${price === null ? "" : ` (${money(price)})`}`,
    );
    return [`${index + 1}. ${text}`, ...alternatives].join("\n");
  });
  return [intro, ...questions, QUESTIONS_HINT].join("\n\n");
}

function droppedNote(item: Item): string {
  return `No conseguí "${item.original}": te pregunté ${MAX_QUESTIONS} veces y no encontré qué llevar`;
}

function removedNote(item: Item): string {
  return `Saqué: ${item.original}`;
}

function ask(state: ConversationState, text: string): Turn {
  return { state, reply: { kind: "ask", text } };
}
