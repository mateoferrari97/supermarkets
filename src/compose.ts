import { downloadCatalog as downloadCarrefourCatalog } from "./adapters/carrefour/catalog-download.ts";
import { createCarrefourStore } from "./adapters/carrefour/carrefour-store.ts";
import { createInMemoryCatalogSearch } from "./adapters/catalog-search/in-memory-catalog-search.ts";
import {
  createClaudeCodeIdeaJudge,
  createClaudeCodeLlm,
  type ClaudeCodeLlmOptions,
  type LlmCall,
} from "./adapters/claude-code/claude-code-llm.ts";
import { createDataFiles, type Checked } from "./adapters/files/data-files.ts";
import {
  loggedSearch,
  loggedStore,
  type WriteConversationEvent,
} from "./core/conversation-log/conversation-log.ts";
import type { ConversationDependencies } from "./core/order-conversation/take-turn.ts";
import type { CatalogProduct } from "./core/order-matching/catalog-product.ts";
import type { CatalogSearch } from "./core/order-matching/catalog-search.ts";
import { matchOrder, type MatchedOrder } from "./core/order-matching/eval-run.ts";
import type { Llm } from "./core/order-matching/llm.ts";
import {
  checkedReadReply,
  type ReadReplyInput,
  type ReadReplyOutput,
} from "./core/order-matching/read-reply.ts";
import type { OnlineStore } from "./core/product-selection/online-store.ts";
import { planFirstMessage, type IdeaToJudge } from "./core/planning/eval-run.ts";
import type { Judgment, PlanRun } from "./core/planning/eval-score.ts";
import type { Topic } from "./core/planning/route-message.ts";

export type { LlmCall } from "./adapters/claude-code/claude-code-llm.ts";
export type { Checked, PreviousEvalRun } from "./adapters/files/data-files.ts";

export type LlmOptions = Omit<ClaudeCodeLlmOptions, "run" | "promptsDir">;

export type ConversationDependenciesWithoutSignal = Omit<ConversationDependencies, "signal">;

export type ConversationLog = {
  path: string;
  write: WriteConversationEvent;
  dependencies: ConversationDependenciesWithoutSignal;
};

export type OrderMatcherOptions = { onCall?: (call: LlmCall) => void };

const files = createDataFiles();

export const {
  loadCatalogProducts,
  loadSnapshotFetchedAt,
  loadEvalSet,
  saveEvalRun,
  loadLatestEvalRun,
  loadPlanningEvalSet,
  savePlanningEvalRun,
} = files;

export function createLlm(options: LlmOptions): Llm {
  return createClaudeCodeLlm({ ...options, promptsDir: files.promptsDir });
}

export function createOnlineStore(): OnlineStore {
  return createCarrefourStore();
}

export function createCatalogSearch(): Checked<CatalogSearch> {
  const products = loadCatalogProducts();
  if (!products.ok) return products;
  return { ok: true, value: createInMemoryCatalogSearch(products.value) };
}

export type OrderMatcher = {
  products: CatalogProduct[];
  snapshotFetchedAt: string | null;
  matchOrder(orderText: string): Promise<MatchedOrder>;
  readReply(input: ReadReplyInput): Promise<ReadReplyOutput>;
};

export function createOrderMatcher({ onCall }: OrderMatcherOptions = {}): Checked<OrderMatcher> {
  const products = loadCatalogProducts();
  if (!products.ok) return products;
  const search = createInMemoryCatalogSearch(products.value);
  const llm = createLlm({ onCall });
  return {
    ok: true,
    value: {
      products: products.value,
      snapshotFetchedAt: files.loadSnapshotFetchedAt(),
      matchOrder: (orderText) => matchOrder(orderText, { search, llm }),
      readReply: (input) => checkedReadReply(llm, input, new AbortController().signal),
    },
  };
}

export type PlanningEvaluator = {
  products: CatalogProduct[];
  snapshotFetchedAt: string | null;
  routeMessage(text: string): Promise<Topic>;
  planFirstMessage(message: string): Promise<PlanRun>;
  judgeIdea(input: IdeaToJudge): Promise<Judgment>;
};

export function createPlanningEvaluator({
  onCall,
}: OrderMatcherOptions = {}): Checked<PlanningEvaluator> {
  const products = loadCatalogProducts();
  if (!products.ok) return products;
  const search = createInMemoryCatalogSearch(products.value);
  const llm = createLlm({ onCall });
  const judge = createClaudeCodeIdeaJudge({ promptsDir: files.promptsDir, onCall });
  const signal = () => new AbortController().signal;
  return {
    ok: true,
    value: {
      products: products.value,
      snapshotFetchedAt: files.loadSnapshotFetchedAt(),
      routeMessage: async (text) => (await llm.routeMessage(text, signal())).topic,
      planFirstMessage: (message) => planFirstMessage(message, { llm, search }),
      judgeIdea: (input) => judge.judgeIdea(input, signal()),
    },
  };
}

export function createConversationDependencies(): Checked<ConversationDependenciesWithoutSignal> {
  const search = createCatalogSearch();
  if (!search.ok) return search;
  return {
    ok: true,
    value: {
      search: search.value,
      llm: createLlm({}),
      store: createOnlineStore(),
    },
  };
}

export function openConversationLog(
  sessionId: string,
  dependencies: ConversationDependenciesWithoutSignal,
  startedAt = new Date(),
): ConversationLog {
  const { path, write } = files.openConversationLog(sessionId, startedAt);
  write({ type: "conversation-started", sessionId, commit: files.headCommit() });
  return {
    path,
    write,
    dependencies: {
      ...dependencies,
      llm: createLlm({ onCall: (call) => write({ type: "llm-call", ...call }) }),
      search: loggedSearch(dependencies.search, write),
      store: loggedStore(dependencies.store, write),
    },
  };
}

export async function downloadCatalog(
  outputDir?: string,
  onCategory?: (done: number) => void,
): Promise<{ meta: object; outputDir: string }> {
  const catalog = await downloadCarrefourCatalog(onCategory);
  return { meta: catalog.meta, outputDir: files.saveCatalog(catalog, outputDir) };
}
