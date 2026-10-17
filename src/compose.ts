import { createClaudeCodeAgent } from "./adapters/agent/claude-code-agent.ts";
import { downloadCatalog as downloadCarrefourCatalog } from "./adapters/carrefour/catalog-download.ts";
import { createCarrefourStore } from "./adapters/carrefour/carrefour-store.ts";
import { createInMemoryCatalogSearch } from "./adapters/catalog-search/in-memory-catalog-search.ts";
import {
  createClaudeCodeLlm,
  type ClaudeCodeLlmOptions,
  type LlmCall,
} from "./adapters/claude-code/claude-code-llm.ts";
import { createDataFiles, type Checked } from "./adapters/files/data-files.ts";
import { agentTools, type ToolsForTurn } from "./core/agent-chat/tools.ts";
import type { ChatAgent } from "./core/agent-chat/agent.ts";
import { runAgentCase, type AgentRun } from "./core/agent-chat/eval-run.ts";
import type { AgentCase } from "./core/agent-chat/eval-set.ts";
import type { CatalogProduct } from "./core/order-matching/catalog-product.ts";
import type { CatalogSearch } from "./core/order-matching/catalog-search.ts";
import type { Llm } from "./core/order-matching/llm.ts";
import type { OnlineStore } from "./core/product-selection/online-store.ts";

export type { LlmCall } from "./adapters/claude-code/claude-code-llm.ts";
export type { Checked } from "./adapters/files/data-files.ts";

export type LlmOptions = Omit<ClaudeCodeLlmOptions, "run" | "promptsDir">;

export type AgentEvaluatorOptions = { onCall?: (call: LlmCall) => void };

const files = createDataFiles();

export const {
  loadChatMessages,
  appendChatMessage,
  loadProfile,
  saveProfile,
  loadOrders,
  saveOrders,
  loadCatalogProducts,
  loadSnapshotFetchedAt,
  loadAgentEvalSet,
  saveAgentEvalRun,
} = files;

export function createLlm(options: LlmOptions): Llm {
  return createClaudeCodeLlm({ ...options, promptsDir: files.promptsDir });
}

export function createChatAgent(): ChatAgent {
  return createClaudeCodeAgent({ promptsDir: files.promptsDir });
}

function valueOrThrow<T>(checked: Checked<T>): T {
  if (!checked.ok) throw new Error(checked.errors.join(" "));
  return checked.value;
}

export function createAgentTools(): Checked<ToolsForTurn> {
  const search = createCatalogSearch();
  if (!search.ok) return search;
  return {
    ok: true,
    value: agentTools({
      store: createOnlineStore(),
      saveProfile: files.saveProfile,
      loadProfile: () => valueOrThrow(files.loadProfile()),
      search: search.value,
      llm: createLlm({}),
      orders: {
        load: () => valueOrThrow(files.loadOrders()),
        save: files.saveOrders,
      },
      now: () => new Date(),
    }),
  };
}

export function createOnlineStore(): OnlineStore {
  return createCarrefourStore();
}

export function createCatalogSearch(): Checked<CatalogSearch> {
  const products = loadCatalogProducts();
  if (!products.ok) return products;
  return { ok: true, value: createInMemoryCatalogSearch(products.value) };
}

export type AgentEvaluator = {
  products: CatalogProduct[];
  snapshotFetchedAt: string | null;
  runCase(evalCase: AgentCase): Promise<AgentRun>;
};

export function createAgentEvaluator({
  onCall,
}: AgentEvaluatorOptions = {}): Checked<AgentEvaluator> {
  const products = loadCatalogProducts();
  if (!products.ok) return products;
  const search = createInMemoryCatalogSearch(products.value);
  const llm = createLlm({ onCall });
  const agent = createChatAgent();
  return {
    ok: true,
    value: {
      products: products.value,
      snapshotFetchedAt: files.loadSnapshotFetchedAt(),
      runCase: (evalCase) =>
        runAgentCase(evalCase, { agent, products: products.value, search, llm }),
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
