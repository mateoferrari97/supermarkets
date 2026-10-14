import { downloadCatalog as downloadCarrefourCatalog } from "./adapters/carrefour/catalog-download.ts";
import { createCarrefourStore, snapshotProducts } from "./adapters/carrefour/carrefour-store.ts";
import {
  DEFAULT_MODEL,
  createClaudeCodeLlm,
  type ClaudeCodeLlmOptions,
  type LlmCall,
} from "./adapters/claude-code/claude-code-llm.ts";
import { createDataFiles, type Checked } from "./adapters/files/data-files.ts";
import type { Llm } from "./core/order-resolution/llm.ts";
import {
  createOrderResolver as createResolver,
  type CatalogProduct,
  type OrderResolver,
} from "./core/order-resolution/resolve-order.ts";
import type { OnlineStore, SnapshotProduct } from "./core/product-selection/online-store.ts";
import type { PaymentCardTable } from "./core/product-selection/payment-cards.ts";
import type { TipoMapping, Vocabulary } from "./core/product-types/schema.ts";

export type { LlmCall } from "./adapters/claude-code/claude-code-llm.ts";
export type { Checked, PreviousEvalRun } from "./adapters/files/data-files.ts";

export type LlmOptions = Omit<ClaudeCodeLlmOptions, "run" | "promptsDir">;

export type OrderData = {
  products: CatalogProduct[];
  snapshot: SnapshotProduct[];
  vocabulary: Vocabulary;
  mapping: TipoMapping;
  paymentCards: PaymentCardTable;
};

export type OrderResolverOptions = { model?: string; onCall?: (call: LlmCall) => void };

const files = createDataFiles();

export const {
  loadCatalog,
  loadProductTypes,
  loadPaymentCards,
  loadEvalSet,
  saveParts,
  loadParts,
  loadPart,
  hasProposal,
  loadProposal,
  loadDecisions,
  loadDoubts,
  saveConsolidation,
  saveEvalRun,
  loadLatestEvalRun,
} = files;

export function createLlm(options: LlmOptions): Llm {
  return createClaudeCodeLlm({ ...options, promptsDir: files.promptsDir });
}

export function createOnlineStore(): OnlineStore {
  return createCarrefourStore();
}

export function loadOrderData(): Checked<OrderData> {
  const loaded = files.loadOrderFiles();
  if (!loaded.ok) return loaded;
  const { catalog, vocabulary, mapping, paymentCards } = loaded.value;
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
      paymentCards,
    },
  };
}

export function createOrderResolver({
  model = DEFAULT_MODEL,
  onCall,
}: OrderResolverOptions = {}): Checked<OrderResolver & { model: string }> {
  const data = loadOrderData();
  if (!data.ok) return data;
  const { products, vocabulary, mapping } = data.value;
  const llm = createLlm({ vocabulary, model, onCall });
  return { ok: true, value: { ...createResolver({ products, vocabulary, mapping, llm }), model } };
}

export async function downloadCatalog(
  outputDir?: string,
  onCategory?: (done: number) => void,
): Promise<{ meta: object; outputDir: string }> {
  const catalog = await downloadCarrefourCatalog(onCategory);
  return { meta: catalog.meta, outputDir: files.saveCatalog(catalog, outputDir) };
}
