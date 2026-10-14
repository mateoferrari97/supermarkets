import type { TipoMapping } from "../product-types/schema.ts";
import { nameMatchesTerm, productMatchesBrand, sizesIn } from "../order-resolution/catalog.ts";
import {
  DEFAULT_SELECTION_POLICY,
  type Llm,
  type SelectionPolicy,
} from "../order-resolution/llm.ts";
import type { OrderItem, OrderResolution } from "../order-resolution/resolve-order.ts";
import { findPaymentCard, type PaymentCardTable } from "./payment-cards.ts";
import { postalCodeFrom } from "./postal-code.ts";
import type {
  OnlineStore,
  SimulatedLine,
  SimulationItem,
  SnapshotProduct,
  StoreProduct,
} from "./store.ts";

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
  notices: string[];
};

export type ProductSelection = {
  postalCode: string;
  lines: PickedLine[];
  total: number;
  notices: string[];
  unexpressed: string[];
};

export type PickDependencies = {
  mapping: TipoMapping;
  store: OnlineStore;
  llm: Pick<Llm, "translatePreference">;
  paymentCards: PaymentCardTable;
  snapshot: SnapshotProduct[];
};

type Ranking = SelectionPolicy["ranking"];

type Priced = { product: StoreProduct; quantity: number; line: SimulatedLine };

type ItemPick = { item: OrderItem; ranked: Priced[]; chosen: number; notices: string[] };

export async function pickProducts(
  resolution: OrderResolution,
  postalCode: string,
  { mapping, store, llm, paymentCards, snapshot }: PickDependencies,
): Promise<ProductSelection> {
  const { paymentCard, preference } = resolution;
  if (resolution.message !== null) {
    throw new Error("Products can only be picked once every question of the order is answered");
  }
  if (postalCodeFrom(postalCode) !== postalCode) {
    throw new Error("Products can only be picked for an accepted postal code");
  }

  const policy =
    preference === null ? DEFAULT_SELECTION_POLICY : await llm.translatePreference({ preference });
  const card = paymentCard === null ? null : findPaymentCard(paymentCards, paymentCard);
  const orderNotices =
    paymentCard !== null && card === null
      ? [`No conozco la tarjeta "${paymentCard}": elegí los productos sin sus promociones.`]
      : [];
  const simulate = (items: SimulationItem[]) => store.simulate({ postalCode, card, items });

  const tiposOf = (item: OrderItem) => {
    const ids = new Set(item.productTypes.map(({ id }) => id));
    return Object.entries(mapping)
      .filter(([, id]) => id !== null && ids.has(id))
      .map(([tipo]) => tipo)
      .sort();
  };

  const priceAlone = async (product: StoreProduct, quantity: number): Promise<Priced | null> => {
    const { lines } = await simulate([{ itemId: product.itemId, quantity }]);
    const line = lines.find(({ itemId }) => itemId === product.itemId);
    return line?.available ? { product, quantity, line } : null;
  };

  const firstAvailable = async (
    item: OrderItem,
    products: StoreProduct[],
    wanted: number,
    batchSize?: number,
  ) => {
    const queue = products.slice(0, SIMULATION_LIMIT);
    const available: Priced[] = [];
    while (available.length < wanted && queue.length > 0) {
      const batch = queue.splice(0, batchSize ?? wanted - available.length);
      const priced = await Promise.all(
        batch.map((product) => priceAlone(product, quantityFor(item, product).quantity)),
      );
      available.push(...priced.filter((candidate): candidate is Priced => candidate !== null));
    }
    return available;
  };

  const pick = async (item: OrderItem): Promise<ItemPick> => {
    const tipos = tiposOf(item);
    const rules = brandRules(item, policy);
    const wanted = (product: StoreProduct) =>
      !rules.excluded.some((brand) => productMatchesBrand(product, brand)) &&
      termsFor(item, product).every((term) => nameMatchesTerm(product.name, term));
    const notices: string[] = [];

    for (const [attempt, brands] of rules.searches.entries()) {
      const found = await store.findCandidates({
        postalCode,
        tipos,
        brands,
        sort: policy.ranking === "cheapest-per-unit" ? "price:asc" : "discount:desc",
        limit: item.terms.length > 0 || rules.excluded.length > 0 ? SEARCH_LIMIT : SIMULATION_LIMIT,
      });
      const available = await firstAvailable(item, found.filter(wanted), CANDIDATES_PER_ITEM);
      if (available.length > 0) {
        if (attempt > 0) {
          notices.push(
            `No encontré ${rules.searches[0]!.join(" ni ")} disponible: elegí otra marca.`,
          );
        }
        return { item, ranked: rank(available, policy.ranking), chosen: 0, notices };
      }
    }

    const fromSnapshot = snapshot.filter(
      (product) =>
        tipos.includes(product.tipo) &&
        (rules.strict.length === 0 ||
          rules.strict.some((brand) => productMatchesBrand(product, brand))) &&
        wanted(product),
    );
    const available = await firstAvailable(item, fromSnapshot, 1, CANDIDATES_PER_ITEM);
    if (available.length > 0) {
      notices.push("La búsqueda no lo encontró: lo elegí del catálogo.");
    }
    return { item, ranked: rank(available, policy.ranking), chosen: 0, notices };
  };

  const picks = await Promise.all(resolution.items.map(pick));

  const inCart = () => picks.filter(({ ranked, chosen }) => ranked[chosen] !== undefined);

  const simulateCart = async (cart: ItemPick[]) => {
    const final =
      cart.length > 0
        ? await simulate(
            cart.map(({ ranked, chosen }) => ({
              itemId: ranked[chosen]!.product.itemId,
              quantity: ranked[chosen]!.quantity,
            })),
          )
        : { lines: [], total: 0 };
    const lines = new Map<ItemPick, SimulatedLine>();
    for (const [position, itemPick] of cart.entries()) {
      const { itemId } = itemPick.ranked[itemPick.chosen]!.product;
      const atPosition = final.lines[position];
      const line =
        atPosition?.itemId === itemId
          ? atPosition
          : final.lines.find((candidate) => candidate.itemId === itemId);
      if (line) lines.set(itemPick, line);
    }
    return { lines, total: final.total };
  };

  let cart = await simulateCart(inCart());
  let missing = inCart().filter((itemPick) => !cart.lines.get(itemPick)?.available);
  while (missing.length > 0) {
    for (const missed of missing) {
      const gone = missed.ranked[missed.chosen]!.product;
      missed.chosen += 1;
      const next = missed.ranked[missed.chosen]?.product;
      missed.notices.push(
        next
          ? `"${gone.name}" dejó de estar disponible al armar el carrito: lo cambié por "${next.name}".`
          : `"${gone.name}" dejó de estar disponible al armar el carrito.`,
      );
    }
    cart = await simulateCart(inCart());
    missing = inCart().filter((itemPick) => !cart.lines.get(itemPick)?.available);
  }

  const lines = await Promise.all(
    picks.map(async (itemPick): Promise<PickedLine> => {
      const { item, ranked, chosen, notices } = itemPick;
      const best = ranked[chosen];
      if (!best) {
        return {
          phrase: item.phrase,
          product: null,
          quantity: Math.ceil(item.quantity ?? 1),
          unitPrice: null,
          total: 0,
          reason: "No encontré ningún producto disponible.",
          notices,
        };
      }
      const line = cart.lines.get(itemPick) ?? best.line;
      const { notice } = quantityFor(item, best.product);
      const changed =
        line.total !== best.line.total
          ? `El precio cambió al armar el carrito: ${money(best.line.total)} antes, ${money(line.total)} ahora.`
          : null;
      const hint = await promotionHint(best, priceAlone);
      return {
        phrase: item.phrase,
        product: best.product,
        quantity: best.quantity,
        unitPrice: line.total / best.quantity,
        total: line.total,
        reason: reasonFor({ ...best, line }, ranked.length === 1, policy.ranking),
        notices: [notice, ...notices, changed, hint].filter(
          (text): text is string => text !== null,
        ),
      };
    }),
  );

  return {
    postalCode,
    lines,
    total: cart.total,
    notices: orderNotices,
    unexpressed: policy.unexpressed,
  };
}

type BrandRules = { searches: string[][]; strict: string[]; excluded: string[] };

function brandRules(item: OrderItem, policy: SelectionPolicy): BrandRules {
  if (item.brand) return { searches: [[item.brand]], strict: [item.brand], excluded: [] };
  const excluded = policy.brandsExcluded;
  if (policy.brandsOnly.length > 0) {
    return { searches: [policy.brandsOnly], strict: policy.brandsOnly, excluded };
  }
  if (policy.brandsPreferred.length > 0) {
    return { searches: [policy.brandsPreferred, []], strict: [], excluded };
  }
  return { searches: [[]], strict: [], excluded };
}

const weightKg = (term: string) => {
  const [size, ...others] = sizesIn(term);
  return size?.dimension === "weight" && others.length === 0 ? size.amount / 1000 : null;
};

function termsFor(item: OrderItem, product: StoreProduct): string[] {
  if (product.weightStepKg === null) return item.terms;
  return item.terms.filter((term) => weightKg(term) === null);
}

function quantityFor(
  item: OrderItem,
  product: StoreProduct,
): { quantity: number; notice: string | null } {
  const step = product.weightStepKg;
  if (step !== null) {
    const kg = item.terms.map(weightKg).find((amount) => amount !== null) ?? item.quantity;
    if (kg === null || kg === undefined) return { quantity: 1, notice: null };
    const quantity = Math.max(1, Math.ceil(round(kg / step)));
    const bought = round(quantity * step);
    return {
      quantity,
      notice:
        bought === round(kg)
          ? null
          : `Se vende de a ${kilos(step)}: compro ${kilos(bought)} en vez de ${kilos(kg)}.`,
    };
  }
  const asked = item.quantity ?? 1;
  const quantity = Math.ceil(asked);
  return {
    quantity,
    notice:
      quantity === asked ? null : `Redondeé ${decimal(asked)} a ${quantity} para no comprar menos.`,
  };
}

async function promotionHint(
  best: Priced,
  priceAlone: (product: StoreProduct, quantity: number) => Promise<Priced | null>,
): Promise<string | null> {
  const teaser = best.product.teasers
    .filter(({ minimumQuantity }) => minimumQuantity > best.quantity)
    .sort((a, b) => a.minimumQuantity - b.minimumQuantity)[0];
  if (!teaser) return null;
  const more = await priceAlone(best.product, teaser.minimumQuantity);
  if (!more) return null;
  const unit = best.line.total / best.quantity;
  const cheaper = more.line.total / more.quantity;
  if (cheaper >= unit) return null;
  return `Llevando ${teaser.minimumQuantity} sale ${money(cheaper)} c/u en vez de ${money(unit)} (${teaser.name}).`;
}

function rank(candidates: Priced[], ranking: Ranking): Priced[] {
  return [...candidates].sort((a, b) => {
    if (ranking === "savings-first") {
      const saves = Number(b.line.savings > 0) - Number(a.line.savings > 0);
      if (saves !== 0) return saves;
    }
    const byPrice = pricePerUnit(a, b) ?? a.line.total / a.quantity - b.line.total / b.quantity;
    if (byPrice !== 0) return byPrice;
    return Number(a.product.itemId) - Number(b.product.itemId);
  });
}

function pricePerUnit(a: Priced, b: Priced): number | null {
  const [first, second] = [a.product.measure, b.product.measure];
  if (!first || first.dimension !== second?.dimension) return null;
  return a.line.total / (a.quantity * first.amount) - b.line.total / (b.quantity * second.amount);
}

function reasonFor({ product, line }: Priced, alone: boolean, ranking: Ranking): string {
  const cheapest =
    product.measure?.dimension === "volume"
      ? "Es el más barato por litro"
      : product.measure?.dimension === "weight"
        ? "Es el más barato por kilo"
        : "Es el más barato";
  if (ranking === "cheapest-per-unit") {
    const base = alone ? "Es el único disponible entre los candidatos" : cheapest;
    return line.promotions.length > 0 ? `${base}, con ${line.promotions.join("; ")}.` : `${base}.`;
  }
  if (line.promotions.length > 0) return `Promoción: ${line.promotions.join("; ")}.`;
  if (line.savings > 0) return `Tiene ${money(line.savings)} de descuento.`;
  if (alone) return "Es el único disponible entre los candidatos.";
  return `${cheapest}.`;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

const decimal = (value: number) => String(round(value)).replace(".", ",");

const kilos = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${decimal(kg)} kg`);

const money = (value: number) => `$${value.toFixed(2)}`;
