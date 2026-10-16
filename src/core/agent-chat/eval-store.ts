import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type {
  Delivery,
  OnlineStore,
  SimulatedLine,
  SimulationItem,
} from "../product-selection/online-store.ts";

export type SnapshotStoreOptions = { doesNotDeliver?: readonly string[] };

export const SNAPSHOT_CART_LINK = "https://eval.invalid/cart";

export function snapshotStore(
  products: readonly CatalogProduct[],
  { doesNotDeliver = [] }: SnapshotStoreOptions = {},
): OnlineStore {
  const byItemId = new Map(products.map((product) => [product.itemId, product]));
  const lineOf = ({ itemId, quantity }: SimulationItem): SimulatedLine => {
    const product = byItemId.get(itemId);
    if (product === undefined || !product.inStock || product.price === null) {
      return { itemId, quantity, available: false, total: 0, savings: 0, promotions: [] };
    }
    const unit = product.sale.kind === "by-weight" ? product.sale.saleStepKg : 1;
    return {
      itemId,
      quantity,
      available: true,
      total: product.price * quantity * unit,
      savings: 0,
      promotions: [],
    };
  };
  return {
    checkDelivery: (postalCode): Promise<Delivery> =>
      Promise.resolve(doesNotDeliver.includes(postalCode) ? "does-not-deliver" : "delivers"),
    simulate: ({ items }) => {
      const lines = items.map(lineOf);
      return Promise.resolve({ lines, total: lines.reduce((sum, line) => sum + line.total, 0) });
    },
    cartLink: (items) =>
      `${SNAPSHOT_CART_LINK}?${items.map(({ itemId, quantity }) => `${itemId}x${String(quantity)}`).join(",")}`,
  };
}
