import type { CatalogProduct } from "./catalog-product.ts";
import type { Item } from "./item.ts";

export const MATCHES_LIMIT = 30;

export type SearchItem = Pick<Item, "product" | "brand">;

export type SearchScope = "order" | "plan";

export type CatalogSearch = {
  findMatches(item: SearchItem, scope: SearchScope, limit?: number): CatalogProduct[];
};
