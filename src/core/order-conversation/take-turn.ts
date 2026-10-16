import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type { Item, ParseOrderLlm } from "../order-matching/item.ts";
import {
  matchItems,
  type FitProductsLlm,
  type ItemMatch,
  type Question,
} from "../order-matching/match-items.ts";
import { checkedReadReply, type ReadReplyLlm } from "../order-matching/read-reply.ts";
import { candidateOf, candidatesFor, type Candidate } from "../product-selection/candidates.ts";
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

export type Mark = "new" | "changed";

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
    case "cart": {
      const { stage: _stage, ...order } = state;
      if (!reply) return nextTurn(order, deps, steps);
      return replyTurn(order, reply, deps, steps, onStep);
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

export const MAX_QUESTIONS = 2;

type InCart = {
  item: Item;
  candidate: Candidate;
  reason: string;
  questionsSpent: number;
};

export type TurnItem =
  | { kind: "ready"; item: Item; toBuy: ItemToBuy; questionsSpent: number; mark: Mark | null }
  | {
      kind: "asked";
      item: Item;
      question: Question;
      questionsSpent: number;
      reasked: boolean;
      mark: Mark | null;
      inCart: InCart | null;
    }
  | ({ kind: "in-cart" } & InCart);

type Order = {
  postalCode: string;
  items: TurnItem[];
  dropped: string[];
  removed: string[];
  ignoredPreference: boolean;
  cartShown: boolean;
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
    items: matched.map((match) => turnItemOf(match, 0, null)),
    dropped: [],
    removed: [],
    ignoredPreference,
    cartShown: false,
  };
  return nextTurn(order, deps, steps);
}

type ToMatch = { item: Item; questionsSpent: number; mark: Mark | null };

type Kept = TurnItem | { kind: "match"; from: number; count: number };

async function replyTurn(
  order: Order,
  reply: string,
  deps: ConversationDependencies,
  steps: Steps,
  onStep: OnStep | undefined,
): Promise<Turn> {
  const listed = order.items.filter((entry) => entry.kind !== "ready");
  const read = await steps.run({ kind: "understand-answer" }, () =>
    checkedReadReply(
      deps.llm,
      {
        items: listed.map((entry) =>
          entry.kind === "asked"
            ? { kind: "asked", original: entry.item.original, question: entry.question }
            : { kind: "bought", original: entry.item.original, product: entry.candidate.product },
        ),
        reply,
      },
      steps.signal,
    ),
  );
  const entryOf = new Map(read.entries.map((entry) => [listed[entry.item - 1], entry]));
  const toMatch: ToMatch[] = [];
  const dropped = [...order.dropped];
  const removed = [...order.removed];
  const kept: Kept[] = [];
  const replaceBy = (lines: Item[], questionsSpent: number, mark: Mark | null) => {
    kept.push({ kind: "match", from: toMatch.length, count: lines.length });
    toMatch.push(...lines.map((item) => ({ item, questionsSpent, mark })));
  };
  for (const current of order.items) {
    if (current.kind === "ready") {
      kept.push(current);
      continue;
    }
    const entry = entryOf.get(current);
    if (current.kind === "in-cart") {
      if (entry?.kind === "lines") replaceBy(entry.lines, 0, "changed");
      else if (entry?.kind === "drop") removed.push(removedNote(current.item));
      else if (entry?.kind === "unanswered" && entry.question !== null) {
        kept.push(correctionQuestion(current, entry.question));
      } else kept.push(current);
      continue;
    }
    const answer = entry!;
    switch (answer.kind) {
      case "choice":
        kept.push({
          kind: "ready",
          item: current.item,
          toBuy: {
            original: current.item.original,
            note: null,
            candidates: [
              candidateOf(current.item, current.question.alternatives[answer.alternative - 1]!),
            ],
            kept: false,
          },
          questionsSpent: current.questionsSpent,
          mark: current.mark,
        });
        break;
      case "lines":
        replaceBy(answer.lines, current.questionsSpent, current.mark);
        break;
      case "drop":
        removed.push(removedNote(current.item));
        break;
      case "unanswered":
        if (current.inCart !== null) {
          kept.push({
            kind: "in-cart",
            ...current.inCart,
            questionsSpent: current.questionsSpent,
          });
        } else if (current.questionsSpent >= MAX_QUESTIONS) {
          dropped.push(droppedNote(current.item));
        } else {
          kept.push({ ...current, questionsSpent: current.questionsSpent + 1, reasked: true });
        }
        break;
    }
  }
  const added: ToMatch[] = read.newLines.map((item) => ({
    item,
    questionsSpent: 0,
    mark: order.cartShown ? "new" : null,
  }));
  const queued = [...toMatch, ...added];
  const matched = await matchItems(
    queued.map(({ item }) => item),
    deps,
    { signal: steps.signal, onStep },
  );
  const fromMatch = (from: number, count: number) =>
    matched.slice(from, from + count).flatMap((match, offset): TurnItem[] => {
      const { questionsSpent, mark } = queued[from + offset]!;
      if (match.question !== null && questionsSpent >= MAX_QUESTIONS) {
        dropped.push(droppedNote(match.item));
        return [];
      }
      return [turnItemOf(match, questionsSpent, mark)];
    });
  const items = [
    ...kept.flatMap((entry) =>
      entry.kind === "match" ? fromMatch(entry.from, entry.count) : [entry],
    ),
    ...fromMatch(toMatch.length, added.length),
  ];
  return nextTurn(
    {
      ...order,
      items,
      dropped,
      removed,
      ignoredPreference: order.ignoredPreference || read.ignoredPreference,
    },
    deps,
    steps,
  );
}

function correctionQuestion(inCart: InCart, text: string): TurnItem {
  if (inCart.questionsSpent >= MAX_QUESTIONS) return { kind: "in-cart", ...inCart };
  return {
    kind: "asked",
    item: inCart.item,
    question: { text, alternatives: [] },
    questionsSpent: inCart.questionsSpent + 1,
    reasked: false,
    mark: "changed",
    inCart,
  };
}

function turnItemOf(
  { item, fits, note, question }: ItemMatch,
  questionsSpent: number,
  mark: Mark | null,
): TurnItem {
  if (question === null) {
    return {
      kind: "ready",
      item,
      toBuy: { original: item.original, note, candidates: candidatesFor(item, fits), kept: false },
      questionsSpent,
      mark,
    };
  }
  return {
    kind: "asked",
    item,
    question,
    questionsSpent: questionsSpent + 1,
    reasked: false,
    mark,
    inCart: null,
  };
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
  const toBuy = order.items.flatMap((entry) =>
    entry.kind === "asked" ? [] : [{ entry, toBuy: toBuyOf(entry) }],
  );
  const simulated = await steps.run({ kind: "simulate-cart" }, () =>
    simulateCart(
      toBuy.map(({ toBuy }) => toBuy),
      order.postalCode,
      store,
      steps.signal,
    ),
  );
  const lines: CartLineShown[] = [];
  const inCart: TurnItem[] = [];
  const notGot: string[] = [];
  for (const [index, result] of simulated.bought.entries()) {
    const { entry, toBuy: bought } = toBuy[index]!;
    if (result.kind === "not-got") {
      notGot.push(result.note);
      continue;
    }
    const { line } = result;
    const candidate = bought.candidates.find(
      ({ product, quantity }) =>
        product.itemId === line.product.itemId && quantity === line.quantity,
    )!;
    const shown =
      entry.kind === "in-cart"
        ? { ...line, reason: entry.reason, notes: [], mark: null }
        : { ...line, mark: entry.mark };
    lines.push(shown);
    inCart.push({
      kind: "in-cart",
      item: entry.item,
      candidate,
      reason: shown.reason,
      questionsSpent: entry.questionsSpent,
    });
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

function toBuyOf(entry: TurnItem & { kind: "ready" | "in-cart" }): ItemToBuy {
  if (entry.kind === "ready") return entry.toBuy;
  return { original: entry.item.original, note: null, candidates: [entry.candidate], kept: true };
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
