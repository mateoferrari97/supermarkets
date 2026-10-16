import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { CART_WARNING } from "../product-selection/cart.ts";
import type { ChatAgent } from "./agent.ts";
import type { ChatMessage } from "./chat.ts";
import { snapshotStore, SNAPSHOT_CART_LINK } from "./eval-store.ts";
import type { AgentCase, AgentTurnCase, TurnEnd } from "./eval-set.ts";
import { openOrderOf, type Cart, type ChatOrder, type OrderLine } from "./order.ts";
import type { Profile } from "./profile.ts";
import { takeAgentTurn } from "./take-agent-turn.ts";
import { agentTools } from "./tools.ts";
import type { FitProductsLlm } from "../order-matching/match-items.ts";
import type { AgentTools, ToolsForTurn } from "./tool.ts";

export type RecordedCall = {
  name: string;
  input: unknown;
  output: unknown;
  error: string | null;
};

export type TurnRun = {
  owner: string;
  reply: ChatMessage;
  ends: TurnEnd;
  calls: RecordedCall[];
  profileBefore: Profile | null;
  durationMs: number;
};

export type AgentRun = {
  turns: TurnRun[];
  profile: Profile | null;
  carts: Cart[];
};

export type AgentCaseRunRecord = {
  error: string | null;
  run: AgentRun | null;
  problems: string[];
  durationMs: number;
  costUsd: number;
};

export type AgentCaseRecord = {
  id: string;
  expectedToFail: string | null;
  passed: boolean;
  runs: AgentCaseRunRecord[];
};

export type AgentEvalRun = {
  startedAt: string;
  snapshotFetchedAt: string | null;
  models: string[];
  runsPerCase: number;
  filters: string[];
  durationMs: number;
  costUsd: number;
  sessions: number;
  stale: { caseId: string; productId: string; reason: "missing" | "out of stock" }[];
  totals: { cases: { hits: number; total: number }; errors: { hits: number; total: number } };
  unexpectedFailures: string[];
  cases: AgentCaseRecord[];
};

export type AgentCaseDependencies = {
  agent: ChatAgent;
  products: readonly CatalogProduct[];
  search: CatalogSearch;
  llm: FitProductsLlm;
  now?: () => Date;
  signal?: AbortSignal;
};

const MINUTE_MS = 60_000;

export function endOf(message: ChatMessage): TurnEnd {
  const types = (message.parts ?? []).map(({ type }) => type);
  if (types.includes("cart")) return "cart";
  if (types.includes("round")) return "round";
  if (types.includes("proposal")) return "proposal";
  return "text";
}

export function pastOrderOf(
  index: number,
  lines: { productId: string; quantity: number }[],
  products: readonly CatalogProduct[],
  postalCode: string,
  at: Date,
): ChatOrder {
  const orderLines = lines.map(({ productId, quantity }): OrderLine => {
    const product = products.find((each) => each.productId === productId);
    if (product === undefined)
      throw new Error(`Past Order product ${productId} is not in the Catalog Snapshot.`);
    const unit = product.sale.kind === "by-weight" ? product.sale.saleStepKg : 1;
    const unitPrice = (product.price ?? 0) * unit;
    return {
      description: product.name,
      productId,
      itemId: product.itemId,
      name: product.name,
      brand: product.brand,
      quantity,
      unitPrice,
      total: unitPrice * quantity,
      reason: "Bought before",
      notes: [],
    };
  });
  const total = orderLines.reduce((sum, line) => sum + line.total, 0);
  const cart: Cart = {
    postalCode,
    lines: orderLines,
    notes: [],
    total,
    warning: CART_WARNING,
    cartLink: SNAPSHOT_CART_LINK,
  };
  return {
    id: `order-${String(index + 1)}`,
    status: "closed",
    openedAt: at.toISOString(),
    items: [],
    proposals: 1,
    proposal: { id: `order-${String(index + 1)}-1`, lines: orderLines, notes: [], total },
    cart,
  };
}

export function recording(tools: ToolsForTurn, calls: RecordedCall[]): ToolsForTurn {
  return (outcome, messages) => {
    const recorded: AgentTools = {};
    for (const [name, tool] of Object.entries(tools(outcome, messages))) {
      recorded[name] = {
        ...tool,
        execute: async (input, signal) => {
          try {
            const output = await tool.execute(input, signal);
            calls.push({ name, input, output, error: null });
            return output;
          } catch (error) {
            calls.push({
              name,
              input,
              output: null,
              error: error instanceof Error ? error.message : String(error),
            });
            throw error;
          }
        },
      };
    }
    return recorded;
  };
}

export async function runAgentCase(
  { setup, turns }: AgentCase,
  {
    agent,
    products,
    search,
    llm,
    now = () => new Date(),
    signal = new AbortController().signal,
  }: AgentCaseDependencies,
): Promise<AgentRun> {
  const start = now();
  const messages: ChatMessage[] = (setup.chat ?? []).map(({ role, text }, index, chat) => ({
    role,
    text,
    at: new Date(start.getTime() - (chat.length - index) * MINUTE_MS).toISOString(),
  }));
  let profile: Profile | null = setup.postalCode === null ? null : { postalCode: setup.postalCode };
  let orders: ChatOrder[] = (setup.pastOrders ?? []).map(({ lines }, index) =>
    pastOrderOf(index, lines, products, setup.postalCode ?? "", start),
  );
  const tools = agentTools({
    store: snapshotStore(products, { doesNotDeliver: setup.doesNotDeliver ?? [] }),
    saveProfile: (saved) => {
      profile = saved;
    },
    loadProfile: () => profile,
    search,
    llm,
    orders: {
      load: () => structuredClone(orders),
      save: (saved) => {
        orders = structuredClone(saved);
      },
    },
    now,
  });
  const runs: TurnRun[] = [];
  for (const turn of turns) runs.push(await runTurn(turn));
  return {
    turns: runs,
    profile,
    carts: runs.flatMap(({ reply }) =>
      (reply.parts ?? []).flatMap((part) => (part.type === "cart" ? [part.cart] : [])),
    ),
  };

  async function runTurn({ owner }: AgentTurnCase): Promise<TurnRun> {
    const calls: RecordedCall[] = [];
    const profileBefore = profile;
    const started = Date.now();
    const reply = await takeAgentTurn([...messages], owner, {
      agent,
      profile,
      order: openOrderOf(orders),
      orders,
      tools: recording(tools, calls),
      save: (message) => messages.push(message),
      now,
      signal,
    });
    return {
      owner,
      reply,
      ends: endOf(reply),
      calls,
      profileBefore,
      durationMs: Date.now() - started,
    };
  }
}
