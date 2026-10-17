import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import type {
  FitProductsInput,
  FitProductsLlm,
  FitProductsOutput,
} from "../order-matching/match-items.ts";
import type { OnlineStore, SimulationRequest } from "../product-selection/online-store.ts";
import type { ChatOrder } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";

export const product = (
  productId: string,
  name: string,
  price: number,
  overrides: Partial<CatalogProduct> = {},
): CatalogProduct => ({
  productId,
  itemId: `${productId}0`,
  name,
  brand: null,
  department: "Lácteos",
  tipo: null,
  price,
  inStock: true,
  sale: { kind: "packaged", size: { dimension: "volume", amount: 1000 } },
  teasers: [],
  ...overrides,
});

export const catalog: CatalogProduct[] = [
  product("1", "Leche entera La Serenísima 1 l", 1000),
  product("2", "Leche entera Sancor 1 l", 800),
  product("3", "Leche entera Verónica 1 l", 900),
  product("4", "Yogur firme Ilolay 190 g", 500, {
    sale: { kind: "packaged", size: { dimension: "weight", amount: 190 } },
  }),
];

export function searchOf(products: CatalogProduct[]): {
  search: CatalogSearch;
  searched: string[];
} {
  const searched: string[] = [];
  return {
    searched,
    search: {
      findMatches: ({ product: wanted }, _scope, limit = 30) => {
        searched.push(wanted);
        const word = wanted.toLowerCase().split(" ")[0]!;
        return products.filter((each) => each.name.toLowerCase().includes(word)).slice(0, limit);
      },
    },
  };
}

export function llmFitting(
  answer: (input: FitProductsInput) => Partial<FitProductsOutput> = () => ({}),
): FitProductsLlm {
  return {
    fitProducts: (input) => {
      const fits = input.matches.map((_, index) => index + 1);
      return Promise.resolve({
        fits,
        closest: [],
        note: null,
        question: fits.length === 0 ? "¿Cuál?" : null,
        ...answer(input),
      });
    },
  };
}

export function storeOf(
  products: CatalogProduct[],
  unavailable: string[] = [],
): { store: OnlineStore; simulated: SimulationRequest[] } {
  const simulated: SimulationRequest[] = [];
  return {
    simulated,
    store: {
      checkDelivery: () => Promise.resolve("delivers"),
      simulate: (request) => {
        simulated.push(request);
        const lines = request.items.map(({ itemId, quantity }) => {
          const found = products.find((each) => each.itemId === itemId)!;
          return {
            itemId,
            quantity,
            available: !unavailable.includes(itemId),
            total: found.price! * quantity,
            savings: 0,
            promotions: [],
          };
        });
        return Promise.resolve({
          lines,
          total: lines.reduce((sum, line) => sum + line.total, 0),
        });
      },
      cartLink: () => "https://example.test/cart",
    },
  };
}

export function memoryOrders(initial: ChatOrder[] = []): {
  orders: OrdersStore;
  current: () => ChatOrder[];
} {
  let saved = structuredClone(initial);
  return {
    current: () => saved,
    orders: {
      load: () => structuredClone(saved),
      save: (orders) => {
        saved = structuredClone(orders);
      },
    },
  };
}
