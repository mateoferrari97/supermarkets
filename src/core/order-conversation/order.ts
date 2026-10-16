import type { Item } from "../order-matching/item.ts";
import type { ItemMatch, Question } from "../order-matching/match-items.ts";
import type { ReadReplyOutput, ReplyEntry, ReplyItem } from "../order-matching/read-reply.ts";
import { candidateOf, candidatesFor, type Candidate } from "../product-selection/candidates.ts";
import {
  CART_WARNING,
  money,
  type CartLine,
  type ItemToBuy,
  type SimulatedCart,
} from "../product-selection/cart.ts";

export const MAX_QUESTIONS = 2;

export const QUESTIONS_HINT =
  'Respondé con el número ("la 2"), con otro producto o marca ("dale, una Patagonia") o "sacala".';

export const IGNORED_PREFERENCE_NOTE = "Por ahora no tengo en cuenta tarjetas ni preferencias.";

export type Mark = "new" | "changed";

type InCart = {
  item: Item;
  candidate: Candidate;
  reason: string;
  questionsSpent: number;
};

export type OrderItem =
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

export type Order = {
  postalCode: string;
  items: OrderItem[];
  dropped: string[];
  removed: string[];
  ignoredPreference: boolean;
  cartShown: boolean;
};

type ToMatch = { kind: "to-match"; item: Item; questionsSpent: number; mark: Mark | null };

export type MatchingOrder = Omit<Order, "items"> & { items: (OrderItem | ToMatch)[] };

export type AppliedReply = { order: MatchingOrder; toMatch: Item[] };

export type AskedQuestion = { number: number; options: string[] };

export type ItemToBuyInOrder = {
  item: Item;
  toBuy: ItemToBuy;
  questionsSpent: number;
  mark: Mark | null;
  keptReason: string | null;
};

export type NextStep =
  | { kind: "questions"; text: string; questions: AskedQuestion[] }
  | { kind: "buy"; items: ItemToBuyInOrder[] };

export type CartLineShown = CartLine & { mark: Mark | null };

export type Cart = {
  postalCode: string;
  lines: CartLineShown[];
  total: number;
  notes: string[];
  warning: string;
  cartLink: string | null;
};

export type CartTaken = { state: { stage: "cart" } & Order; cart: Cart };

export function startOrder(
  postalCode: string,
  matched: ItemMatch[],
  ignoredPreference: boolean,
): Order {
  return withMatches(
    {
      postalCode,
      items: matched.map(({ item }) => ({ kind: "to-match", item, questionsSpent: 0, mark: null })),
      dropped: [],
      removed: [],
      ignoredPreference,
      cartShown: false,
    },
    matched,
  );
}

export function replyItems(order: Order): ReplyItem[] {
  return listed(order).map((entry) =>
    entry.kind === "asked"
      ? { kind: "asked", original: entry.item.original, question: entry.question }
      : { kind: "bought", original: entry.item.original, product: entry.candidate.product },
  );
}

function listed(order: Order): (OrderItem & { kind: "asked" | "in-cart" })[] {
  return order.items.filter((entry) => entry.kind !== "ready");
}

export function applyReply(order: Order, read: ReadReplyOutput): AppliedReply {
  const listedItems = listed(order);
  const entryOf = new Map(read.entries.map((entry) => [listedItems[entry.item - 1], entry]));
  const dropped = [...order.dropped];
  const removed = [...order.removed];
  const next = order.items.flatMap((current): (OrderItem | ToMatch)[] => {
    if (current.kind === "ready") return [current];
    const entry = entryOf.get(current);
    if (current.kind === "in-cart") {
      if (entry === undefined) return [current];
      if (entry.kind === "drop") {
        removed.push(removedNote(current.item));
        return [];
      }
      return correctionOf(current, entry);
    }
    if (entry === undefined) {
      throw new Error(`no read-reply entry for the asked Item "${current.item.original}"`);
    }
    return answerOf(current, entry, { dropped, removed });
  });
  const added = read.newLines.map((item): ToMatch => ({
    kind: "to-match",
    item,
    questionsSpent: 0,
    mark: order.cartShown ? "new" : null,
  }));
  const items = [...next, ...added];
  return {
    order: {
      ...order,
      items,
      dropped,
      removed,
      ignoredPreference: order.ignoredPreference || read.ignoredPreference,
    },
    toMatch: items.flatMap((entry) => (entry.kind === "to-match" ? [entry.item] : [])),
  };
}

function correctionOf(
  current: OrderItem & { kind: "in-cart" },
  entry: ReplyEntry,
): (OrderItem | ToMatch)[] {
  if (entry.kind === "lines") return toMatch(entry.lines, 0, "changed");
  if (entry.kind !== "unanswered" || entry.question === null) return [current];
  const { kind: _kind, ...inCart } = current;
  const text = entry.question;
  return [
    asking<OrderItem>(
      inCart.questionsSpent,
      () => current,
      (questionsSpent) => ({
        kind: "asked",
        item: inCart.item,
        question: { text, alternatives: [] },
        questionsSpent,
        reasked: false,
        mark: "changed",
        inCart,
      }),
    ),
  ];
}

function answerOf(
  current: OrderItem & { kind: "asked" },
  entry: ReplyEntry,
  { dropped, removed }: { dropped: string[]; removed: string[] },
): (OrderItem | ToMatch)[] {
  switch (entry.kind) {
    case "choice":
      return [
        {
          kind: "ready",
          item: current.item,
          toBuy: {
            original: current.item.original,
            note: null,
            candidates: [
              candidateOf(current.item, current.question.alternatives[entry.alternative - 1]!),
            ],
            kept: false,
          },
          questionsSpent: current.questionsSpent,
          mark: current.mark,
        },
      ];
    case "lines":
      return toMatch(entry.lines, current.questionsSpent, current.mark);
    case "drop":
      removed.push(removedNote(current.item));
      return [];
    case "unanswered":
      if (current.inCart !== null) {
        return [{ kind: "in-cart", ...current.inCart, questionsSpent: current.questionsSpent }];
      }
      return asking(
        current.questionsSpent,
        () => {
          dropped.push(droppedNote(current.item));
          return [];
        },
        (questionsSpent) => [{ ...current, questionsSpent, reasked: true }],
      );
  }
}

function toMatch(lines: Item[], questionsSpent: number, mark: Mark | null): ToMatch[] {
  return lines.map((item) => ({ kind: "to-match", item, questionsSpent, mark }));
}

export function withMatches(order: MatchingOrder, matched: ItemMatch[]): Order {
  const results = [...matched];
  const dropped = [...order.dropped];
  const items = order.items.flatMap((entry): OrderItem[] => {
    if (entry.kind !== "to-match") return [entry];
    const match = results.shift();
    if (match === undefined) throw new Error(`no match result for "${entry.item.original}"`);
    return matchedItem(match, entry, dropped);
  });
  if (results.length > 0) {
    throw new Error(
      `${String(results.length)} match results more than the Items given out for matching`,
    );
  }
  return { ...order, items, dropped };
}

function matchedItem(
  { item, fits, note, question }: ItemMatch,
  { questionsSpent, mark }: ToMatch,
  dropped: string[],
): OrderItem[] {
  if (question === null) {
    return [
      {
        kind: "ready",
        item,
        toBuy: {
          original: item.original,
          note,
          candidates: candidatesFor(item, fits),
          kept: false,
        },
        questionsSpent,
        mark,
      },
    ];
  }
  return asking(
    questionsSpent,
    () => {
      dropped.push(droppedNote(item));
      return [];
    },
    (spent) => [
      {
        kind: "asked",
        item,
        question,
        questionsSpent: spent,
        reasked: false,
        mark,
        inCart: null,
      },
    ],
  );
}

function asking<T>(
  questionsSpent: number,
  atLimit: () => T,
  ask: (questionsSpent: number) => T,
): T {
  return questionsSpent < MAX_QUESTIONS ? ask(questionsSpent + 1) : atLimit();
}

export function nextStep(order: Order): NextStep {
  const asked = order.items.filter((entry) => entry.kind === "asked");
  if (asked.length > 0) {
    return {
      kind: "questions",
      text: questionsText(asked),
      questions: asked.map(({ question }, index) => ({
        number: index + 1,
        options: question.alternatives.map(({ name }) => name),
      })),
    };
  }
  return { kind: "buy", items: itemsToBuy(order) };
}

function itemsToBuy(order: Order): ItemToBuyInOrder[] {
  return order.items.flatMap((entry): ItemToBuyInOrder[] => {
    if (entry.kind === "ready") {
      return [{ ...entry, keptReason: null }];
    }
    if (entry.kind === "in-cart") {
      return [
        {
          item: entry.item,
          toBuy: {
            original: entry.item.original,
            note: null,
            candidates: [entry.candidate],
            kept: true,
          },
          questionsSpent: entry.questionsSpent,
          mark: null,
          keptReason: entry.reason,
        },
      ];
    }
    return [];
  });
}

export function takeCart(order: Order, simulated: SimulatedCart): CartTaken {
  if (order.items.some((entry) => entry.kind === "asked")) {
    throw new Error("a cart taken while the Order still asks questions");
  }
  const toBuy = itemsToBuy(order);
  if (simulated.bought.length !== toBuy.length) {
    throw new Error(
      `${String(simulated.bought.length)} cart results for ${String(toBuy.length)} Items to buy`,
    );
  }
  const lines: CartLineShown[] = [];
  const inCart: OrderItem[] = [];
  const notGot: string[] = [];
  for (const [index, result] of simulated.bought.entries()) {
    const bought = toBuy[index]!;
    if (result.kind === "not-got") {
      notGot.push(result.note);
      continue;
    }
    const { line } = result;
    const candidate = bought.toBuy.candidates.find(
      ({ product, quantity }) =>
        product.itemId === line.product.itemId && quantity === line.quantity,
    )!;
    const shown =
      bought.keptReason === null
        ? { ...line, mark: bought.mark }
        : { ...line, reason: bought.keptReason, notes: [], mark: null };
    lines.push(shown);
    inCart.push({
      kind: "in-cart",
      item: bought.item,
      candidate,
      reason: shown.reason,
      questionsSpent: bought.questionsSpent,
    });
  }
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
    cart: {
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
    },
  };
}

function questionsText(asked: (OrderItem & { kind: "asked" })[]): string {
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
