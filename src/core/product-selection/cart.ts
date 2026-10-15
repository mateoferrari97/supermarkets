import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import { inParallel } from "../order-matching/in-parallel.ts";
import type { Candidate } from "./candidates.ts";
import type { OnlineStore, SimulatedLine, SimulationItem } from "./online-store.ts";
import { rankBySelectionPolicy } from "./selection-policy.ts";

export const SIMULATIONS_CONCURRENCY = 10;

export const CART_WARNING =
  "Antes de abrir el link, vaciá tu carrito de Carrefour: el link agrega productos pero no saca los que ya estaban.";

export type ItemToBuy = { original: string; note: string | null; candidates: Candidate[] };

export type CartLine = {
  original: string;
  product: CatalogProduct;
  quantity: number;
  unitPrice: number;
  total: number;
  reason: string;
  notes: string[];
};

export type Bought = { kind: "bought"; line: CartLine } | { kind: "not-got"; note: string };

export type SimulatedCart = { bought: Bought[]; total: number; cartLink: string | null };

type Priced = { candidate: Candidate; total: number; savings: number; line: SimulatedLine };

type Pick = { item: ItemToBuy; ranked: Priced[]; chosen: number; notes: string[] };

export async function simulateCart(
  items: ItemToBuy[],
  postalCode: string,
  store: OnlineStore,
  signal: AbortSignal,
): Promise<SimulatedCart> {
  const simulate = (simulated: SimulationItem[]) =>
    store.simulate({ postalCode, items: simulated }, signal);

  const priceAlone = async (candidate: Candidate, quantity: number): Promise<Priced | null> => {
    const { itemId } = candidate.product;
    const { lines } = await simulate([{ itemId, quantity }]);
    const line = lines.find((simulated) => simulated.itemId === itemId);
    return line?.available ? { candidate, total: line.total, savings: line.savings, line } : null;
  };

  const queue = items.flatMap((item, index) =>
    item.candidates.map((candidate) => ({ index, candidate })),
  );
  const priced = await inParallel(queue, SIMULATIONS_CONCURRENCY, signal, ({ candidate }) =>
    priceAlone(candidate, candidate.quantity),
  );
  const picks: Pick[] = items.map((item, index) => ({
    item,
    ranked: rankBySelectionPolicy(
      queue.flatMap((queued, position) => {
        const simulated = priced[position];
        return queued.index === index && simulated ? [simulated] : [];
      }),
    ),
    chosen: 0,
    notes: [],
  }));

  const inCart = () => picks.filter(({ ranked, chosen }) => ranked[chosen] !== undefined);
  const chosenOf = ({ ranked, chosen }: Pick) => ranked[chosen]!;

  const simulateWhole = async (cart: Pick[]) => {
    const whole =
      cart.length > 0
        ? await simulate(
            cart.map((pick) => ({
              itemId: chosenOf(pick).candidate.product.itemId,
              quantity: chosenOf(pick).candidate.quantity,
            })),
          )
        : { lines: [], total: 0 };
    const lines = new Map<Pick, SimulatedLine>();
    for (const [position, pick] of cart.entries()) {
      const { itemId } = chosenOf(pick).candidate.product;
      const atPosition = whole.lines[position];
      const line =
        atPosition?.itemId === itemId
          ? atPosition
          : whole.lines.find((simulated) => simulated.itemId === itemId);
      if (line) lines.set(pick, line);
    }
    return { lines, total: whole.total };
  };

  let whole = await simulateWhole(inCart());
  let missing = inCart().filter((pick) => !whole.lines.get(pick)?.available);
  while (missing.length > 0) {
    for (const pick of missing) {
      const gone = chosenOf(pick).candidate.product;
      pick.chosen += 1;
      const next = pick.ranked[pick.chosen];
      if (next) {
        pick.notes.push(
          `"${gone.name}" no estaba disponible al armar el carrito: lo cambié por "${next.candidate.product.name}"`,
        );
      } else {
        pick.notes.push(`"${gone.name}" no estaba disponible al armar el carrito`);
      }
    }
    whole = await simulateWhole(inCart());
    missing = inCart().filter((pick) => !whole.lines.get(pick)?.available);
  }

  const bought = await inParallel(
    picks,
    SIMULATIONS_CONCURRENCY,
    signal,
    async (pick): Promise<Bought> => {
      const best = pick.ranked[pick.chosen];
      if (!best) return { kind: "not-got", note: notGotNote(pick) };
      const line = whole.lines.get(pick) ?? best.line;
      const { candidate } = best;
      const hint = await promotionHint(best, priceAlone);
      return {
        kind: "bought",
        line: {
          original: pick.item.original,
          product: candidate.product,
          quantity: candidate.quantity,
          unitPrice: line.total / candidate.quantity,
          total: line.total,
          reason: reasonFor(candidate.product, line, pick.ranked.length === 1),
          notes: [pick.item.note, ...candidate.notes, ...pick.notes, hint].filter(
            (note): note is string => note !== null,
          ),
        },
      };
    },
  );

  const inLink = bought.flatMap((result) =>
    result.kind === "bought"
      ? [{ itemId: result.line.product.itemId, quantity: result.line.quantity }]
      : [],
  );
  return {
    bought,
    total: whole.total,
    cartLink: inLink.length > 0 ? store.cartLink(inLink) : null,
  };
}

function notGotNote({ item, ranked, notes }: Pick): string {
  const why =
    item.candidates.length === 0
      ? "no encontré cómo llevar lo que pediste"
      : ranked.length === 0
        ? "no hay ninguno disponible en tu sucursal"
        : notes.at(-1)!;
  return `No conseguí "${item.original}": ${why}`;
}

async function promotionHint(
  best: Priced,
  priceAlone: (candidate: Candidate, quantity: number) => Promise<Priced | null>,
): Promise<string | null> {
  const { candidate } = best;
  const teaser = candidate.product.teasers
    .filter(({ minimumQuantity }) => minimumQuantity > candidate.quantity)
    .sort((a, b) => a.minimumQuantity - b.minimumQuantity)[0];
  if (!teaser) return null;
  const more = await priceAlone(candidate, teaser.minimumQuantity);
  if (!more) return null;
  const unit = best.total / candidate.quantity;
  const cheaper = more.total / teaser.minimumQuantity;
  if (cheaper >= unit) return null;
  return `Llevando ${teaser.minimumQuantity} sale ${money(cheaper)} c/u en vez de ${money(unit)} (${teaser.name})`;
}

function reasonFor(product: CatalogProduct, line: SimulatedLine, alone: boolean): string {
  if (line.promotions.length > 0) return `Promoción: ${line.promotions.join("; ")}.`;
  if (line.savings > 0) return `Tiene ${money(line.savings)} de descuento.`;
  if (alone) return "Es el único disponible entre los candidatos.";
  if (product.sale.kind === "by-weight") return "Es el más barato por kilo.";
  switch (product.sale.size?.dimension) {
    case "volume":
      return "Es el más barato por litro.";
    case "weight":
      return "Es el más barato por kilo.";
    default:
      return "Es el más barato.";
  }
}

const money = (value: number) => `$${value.toFixed(2)}`;
