import type { CatalogProduct } from "../../core/order-matching/catalog-product.ts";
import {
  MATCHES_LIMIT,
  type CatalogSearch,
  type SearchItem,
  type SearchScope,
} from "../../core/order-matching/catalog-search.ts";
import { buildBm25Index } from "./bm25.ts";
import { buildWordSimilarityIndex } from "./word-similarity.ts";

export const RRF_K = 60;

export const EXCLUDED_DEPARTMENTS: readonly string[] = [
  "Electro y tecnología",
  "Automotor",
  "Indumentaria",
  "Juguetería y Librería",
  "Aire Libre y Ocio",
];

const excluded = new Set(EXCLUDED_DEPARTMENTS.map((department) => department.normalize("NFC")));

export function searchable(product: CatalogProduct, scope: SearchScope): boolean {
  if (!product.inStock) return false;
  return scope === "plan" || !excluded.has(product.department.normalize("NFC"));
}

export function queriesFor({ product, brand }: SearchItem): string[] {
  return brand ? [product, `${product} ${brand}`] : [product];
}

function ranks(scores: Map<number, number>): Map<number, number> {
  const ordered = [...scores].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const result = new Map<number, number>();
  let rank = 0;
  let previousScore = Number.NaN;
  ordered.forEach(([index, score], position) => {
    if (score !== previousScore) rank = position + 1;
    previousScore = score;
    result.set(index, rank);
  });
  return result;
}

type ScopeIndex = { products: CatalogProduct[]; rankings: Ranking[] };

type Ranking = { scores(query: string): Map<number, number> };

function indexOf(products: CatalogProduct[]): ScopeIndex {
  const documents = products.map((product) =>
    [product.name, product.brand ?? "", product.tipo ?? ""].join(" "),
  );
  return { products, rankings: [buildBm25Index(documents), buildWordSimilarityIndex(documents)] };
}

export function createInMemoryCatalogSearch(products: CatalogProduct[]): CatalogSearch {
  const indexes = new Map<SearchScope, ScopeIndex>();
  const indexFor = (scope: SearchScope) => {
    let index = indexes.get(scope);
    if (!index) {
      index = indexOf(products.filter((product) => searchable(product, scope)));
      indexes.set(scope, index);
    }
    return index;
  };

  return {
    findMatches(item, scope, limit = MATCHES_LIMIT) {
      const { products: indexed, rankings } = indexFor(scope);
      const fused = new Map<number, number>();
      for (const query of queriesFor(item)) {
        for (const ranking of rankings) {
          for (const [index, rank] of ranks(ranking.scores(query))) {
            fused.set(index, (fused.get(index) ?? 0) + 1 / (RRF_K + rank));
          }
        }
      }
      return [...fused]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, limit)
        .map(([index]) => indexed[index]!);
    },
  };
}
