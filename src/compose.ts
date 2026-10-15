import { downloadCatalog as downloadCarrefourCatalog } from "./adapters/carrefour/catalog-download.ts";
import { createCarrefourStore, snapshotProducts } from "./adapters/carrefour/carrefour-store.ts";
import { createInMemoryCatalogSearch } from "./adapters/catalog-search/in-memory-catalog-search.ts";
import {
  DEFAULT_MODEL,
  createClaudeCodeLlm,
  type ClaudeCodeLlmOptions,
  type LlmCall,
} from "./adapters/claude-code/claude-code-llm.ts";
import { createDataFiles, type Checked } from "./adapters/files/data-files.ts";
import {
  loggedStore,
  type WriteConversationEvent,
} from "./core/conversation-log/conversation-log.ts";
import type { ConversationDependencies } from "./core/order-conversation/take-turn.ts";
import type { CatalogProduct as SnapshotCatalogProduct } from "./core/order-matching/catalog-product.ts";
import type { CatalogSearch } from "./core/order-matching/catalog-search.ts";
import { matchOrder, type MatchedOrder } from "./core/order-matching/eval-run.ts";
import type { ReadReplyInput, ReadReplyOutput } from "./core/order-matching/read-reply.ts";
import type { Llm } from "./core/order-resolution/llm.ts";
import {
  createOrderResolver as createResolver,
  type CatalogProduct,
  type OrderResolver,
} from "./core/order-resolution/resolve-order.ts";
import type { OnlineStore, SnapshotProduct } from "./core/product-selection/online-store.ts";
import type { TipoMapping, Vocabulary } from "./core/product-types/schema.ts";

export type { LlmCall } from "./adapters/claude-code/claude-code-llm.ts";
export type { Checked, PreviousEvalRun } from "./adapters/files/data-files.ts";

export type LlmOptions = Omit<ClaudeCodeLlmOptions, "run" | "promptsDir">;

export type OrderData = {
  products: CatalogProduct[];
  snapshot: SnapshotProduct[];
  vocabulary: Vocabulary;
  mapping: TipoMapping;
};

export type ConversationDependenciesWithoutSignal = Omit<ConversationDependencies, "signal"> & {
  vocabulary: Vocabulary;
};

export type ConversationLog = {
  path: string;
  write: WriteConversationEvent;
  dependencies: ConversationDependenciesWithoutSignal;
};

export type OrderResolverOptions = { onCall?: (call: LlmCall) => void };

const files = createDataFiles();

export const {
  loadCatalog,
  loadCatalogProducts,
  loadSnapshotFetchedAt,
  loadProductTypes,
  loadEvalSet,
  saveEvalRun,
  loadLatestEvalRun,
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

export function loadOrderData(): Checked<OrderData> {
  const loaded = files.loadOrderFiles();
  if (!loaded.ok) return loaded;
  const { catalog, vocabulary, mapping } = loaded.value;
  return {
    ok: true,
    value: {
      products: catalog.map((product) => ({
        name: product.name,
        brand: product.brand ?? null,
        tipo: product.tipo,
        inStock: product.availableQuantity > 0,
      })),
      snapshot: snapshotProducts(
        [...catalog].sort(
          (a, b) => Number(b.availableQuantity > 0) - Number(a.availableQuantity > 0),
        ),
      ),
      vocabulary,
      mapping,
    },
  };
}

export function createOrderResolver({ onCall }: OrderResolverOptions = {}): Checked<
  OrderResolver & { model: string }
> {
  const data = loadOrderData();
  if (!data.ok) return data;
  const { products, vocabulary, mapping } = data.value;
  const llm = createLlm({ vocabulary, onCall });
  return {
    ok: true,
    value: { ...createResolver({ products, vocabulary, mapping, llm }), model: DEFAULT_MODEL },
  };
}

export type OrderMatcher = {
  products: SnapshotCatalogProduct[];
  snapshotFetchedAt: string | null;
  matchOrder(orderText: string): Promise<MatchedOrder>;
  readReply(input: ReadReplyInput): Promise<ReadReplyOutput>;
};

export function createOrderMatcher({ onCall }: OrderResolverOptions = {}): Checked<OrderMatcher> {
  const products = loadCatalogProducts();
  const productTypes = loadProductTypes();
  if (!products.ok || !productTypes.ok) {
    return {
      ok: false,
      errors: [products, productTypes].flatMap((loaded) => (loaded.ok ? [] : loaded.errors)),
    };
  }
  const search = createInMemoryCatalogSearch(products.value);
  const llm = createLlm({ vocabulary: productTypes.value.vocabulary, onCall });
  return {
    ok: true,
    value: {
      products: products.value,
      snapshotFetchedAt: files.loadSnapshotFetchedAt(),
      matchOrder: (orderText) => matchOrder(orderText, { search, llm }),
      readReply: (input) => llm.readReply(input, new AbortController().signal),
    },
  };
}

export function createConversationDependencies(): Checked<ConversationDependenciesWithoutSignal> {
  const search = createCatalogSearch();
  const productTypes = files.loadProductTypes();
  if (!search.ok || !productTypes.ok) {
    return {
      ok: false,
      errors: [search, productTypes].flatMap((loaded) => (loaded.ok ? [] : loaded.errors)),
    };
  }
  const { vocabulary } = productTypes.value;
  return {
    ok: true,
    value: {
      vocabulary,
      search: search.value,
      llm: createLlm({ vocabulary }),
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
      llm: createLlm({
        vocabulary: dependencies.vocabulary,
        onCall: (call) => write({ type: "llm-call", ...call }),
      }),
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
