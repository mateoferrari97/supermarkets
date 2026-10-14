import type { TipoMapping, Vocabulary } from "../product-types/schema.ts";
import { buildBm25Index } from "./bm25.ts";
import type { Evidence, Item, Llm } from "./llm.ts";

export const EVIDENCE_LIMIT = 10;

export type CatalogProduct = { name: string; brand: string | null; tipo: string | null };

export type ProductTypeRef = { id: string; name: string };

export type ResolvedItem = Item & { status: "resolved"; productType: ProductTypeRef };

export type PendingItem = Item & {
  status: "pending";
  reason: "group" | "ambiguous" | "none";
  candidates: ProductTypeRef[];
};

export type OrderResolution = { items: (ResolvedItem | PendingItem)[] };

export type OrderDependencies = {
  products: CatalogProduct[];
  vocabulary: Vocabulary;
  mapping: TipoMapping;
  llm: Llm;
};

export type OrderResolver = (orderText: string) => Promise<OrderResolution>;

export function createOrderResolver({
  products,
  vocabulary,
  mapping,
  llm,
}: OrderDependencies): OrderResolver {
  const productTypes = new Map<string, ProductTypeRef>();
  const groupChildren = new Map<string, ProductTypeRef[]>();
  for (const group of vocabulary.groups) {
    groupChildren.set(group.id, group.productTypes);
    for (const productType of group.productTypes) productTypes.set(productType.id, productType);
  }

  const indexed = products.flatMap((product) => {
    const id = product.tipo ? mapping[product.tipo] : undefined;
    const productType = id ? productTypes.get(id) : undefined;
    return productType ? [{ product, productType }] : [];
  });
  const index = buildBm25Index(
    indexed.map(({ product }) => [product.name, product.brand ?? ""].join(" ")),
  );

  const evidenceFor = (item: Item): Evidence[] => {
    const query = [item.phrase, item.brand ?? "", ...item.terms].join(" ");
    const seen = new Set<string>();
    return index
      .search(query, EVIDENCE_LIMIT * 3)
      .map((position) => indexed[position]!)
      .filter(({ product }) => !seen.has(product.name) && seen.add(product.name))
      .slice(0, EVIDENCE_LIMIT)
      .map(({ product, productType }) => ({
        product: product.name,
        productTypeId: productType.id,
        productTypeName: productType.name,
      }));
  };

  const expand = (ids: string[]) => {
    const refs = new Map<string, ProductTypeRef>();
    for (const id of ids) {
      const productType = productTypes.get(id);
      if (productType) refs.set(productType.id, productType);
      for (const child of groupChildren.get(id) ?? []) refs.set(child.id, child);
    }
    return [...refs.values()];
  };

  const resolveItem = async (item: Item): Promise<ResolvedItem | PendingItem> => {
    const answer = await llm.resolveItem({ item, evidence: evidenceFor(item) });
    const known = answer.candidates.filter((id) => productTypes.has(id) || groupChildren.has(id));
    const candidates = expand(known);
    if (candidates.length === 0 || answer.kind === "none") {
      return { ...item, status: "pending", reason: "none", candidates: [] };
    }
    const [only] = candidates;
    if (answer.kind === "match" && candidates.length === 1 && only && productTypes.has(known[0]!)) {
      return { ...item, status: "resolved", productType: only };
    }
    const reason = known.some((id) => groupChildren.has(id)) ? "group" : "ambiguous";
    return { ...item, status: "pending", reason, candidates };
  };

  return async (orderText) => {
    const { items } = await llm.splitOrder(orderText);
    return { items: await Promise.all(items.map(resolveItem)) };
  };
}

export function resolveOrder(
  orderText: string,
  dependencies: OrderDependencies,
): Promise<OrderResolution> {
  return createOrderResolver(dependencies)(orderText);
}
