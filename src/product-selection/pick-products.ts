import type { TipoMapping } from "../product-types/schema.ts";
import { nameMatchesTerm } from "../order-resolution/catalog.ts";
import type { OrderItem, OrderResolution } from "../order-resolution/resolve-order.ts";
import type { OnlineStore, SimulatedLine, StoreProduct } from "./store.ts";

export const CANDIDATES_PER_ITEM = 2;
export const SEARCH_LIMIT = 50;
export const SIMULATION_LIMIT = 10;

export type PickedLine = {
  phrase: string;
  product: StoreProduct | null;
  quantity: number;
  unitPrice: number | null;
  total: number;
  reason: string;
};

export type ProductSelection = { lines: PickedLine[]; total: number };

export type PickDependencies = { mapping: TipoMapping; store: OnlineStore };

type Priced = { product: StoreProduct; line: SimulatedLine };

export async function pickProducts(
  resolution: OrderResolution,
  { mapping, store }: PickDependencies,
): Promise<ProductSelection> {
  const { postalCode } = resolution;
  if (resolution.message !== null || postalCode === null) {
    throw new Error("Products can only be picked once every question of the order is answered");
  }

  const tiposOf = (item: OrderItem) => {
    const ids = new Set(item.productTypes.map(({ id }) => id));
    return Object.entries(mapping)
      .filter(([, id]) => id !== null && ids.has(id))
      .map(([tipo]) => tipo)
      .sort();
  };

  const pick = async (item: OrderItem) => {
    const quantity = Math.ceil(item.quantity ?? 1);
    const found = await store.findCandidates({
      postalCode,
      tipos: tiposOf(item),
      brand: item.brand,
      sort: "discount:desc",
      limit: item.terms.length > 0 ? SEARCH_LIMIT : SIMULATION_LIMIT,
    });
    const queue = found
      .filter(({ name }) => item.terms.every((term) => nameMatchesTerm(name, term)))
      .slice(0, SIMULATION_LIMIT);
    const available: Priced[] = [];
    while (available.length < CANDIDATES_PER_ITEM && queue.length > 0) {
      const batch = queue.splice(0, CANDIDATES_PER_ITEM - available.length);
      const priced = await Promise.all(
        batch.map(async (product): Promise<Priced | null> => {
          const { lines } = await store.simulate(postalCode, [
            { itemId: product.itemId, quantity },
          ]);
          const line = lines.find(({ itemId }) => itemId === product.itemId);
          return line?.available ? { product, line } : null;
        }),
      );
      available.push(...priced.filter((candidate): candidate is Priced => candidate !== null));
    }
    const [best] = available.sort(compareCandidates);
    return { item, quantity, best, alone: available.length === 1 };
  };

  const picks = await Promise.all(resolution.items.map(pick));
  const chosen = picks.flatMap(({ best, quantity }) =>
    best ? [{ itemId: best.product.itemId, quantity }] : [],
  );
  const final =
    chosen.length > 0 ? await store.simulate(postalCode, chosen) : { lines: [], total: 0 };

  const lines = picks.map(({ item, quantity, best, alone }): PickedLine => {
    if (!best) {
      return {
        phrase: item.phrase,
        product: null,
        quantity,
        unitPrice: null,
        total: 0,
        reason: "No encontré ningún producto disponible.",
      };
    }
    const line = final.lines.find(({ itemId }) => itemId === best.product.itemId) ?? best.line;
    return {
      phrase: item.phrase,
      product: best.product,
      quantity,
      unitPrice: line.total / quantity,
      total: line.total,
      reason: reasonFor({ product: best.product, line }, alone),
    };
  });
  return { lines, total: final.total };
}

function compareCandidates(a: Priced, b: Priced): number {
  const saves = Number(b.line.savings > 0) - Number(a.line.savings > 0);
  if (saves !== 0) return saves;
  const byPrice = pricePerUnit(a, b) ?? a.line.total - b.line.total;
  if (byPrice !== 0) return byPrice;
  return Number(a.product.itemId) - Number(b.product.itemId);
}

function pricePerUnit(a: Priced, b: Priced): number | null {
  const [first, second] = [a.product.measure, b.product.measure];
  if (!first || first.dimension !== second?.dimension) return null;
  return (
    a.line.total / (a.line.quantity * first.amount) -
    b.line.total / (b.line.quantity * second.amount)
  );
}

function reasonFor({ product, line }: Priced, alone: boolean): string {
  if (line.promotions.length > 0) return `Promoción: ${line.promotions.join("; ")}.`;
  if (line.savings > 0) return `Tiene $${line.savings.toFixed(2)} de descuento.`;
  if (alone) return "Es el único disponible entre los candidatos.";
  if (product.measure?.dimension === "volume") return "Es el más barato por litro.";
  if (product.measure?.dimension === "weight") return "Es el más barato por kilo.";
  return "Es el más barato.";
}
