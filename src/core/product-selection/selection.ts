import type {
  CatalogProduct,
  PackageSize,
  SizeDimension,
} from "../order-matching/catalog-product.ts";
import { inParallel } from "../order-matching/in-parallel.ts";
import { roundMeasure, type Item, type Quantity, type Size } from "../order-matching/item.ts";
import type { OnlineStore } from "./online-store.ts";

export const CANDIDATES_LIMIT = 10;

export const SIMULATIONS_CONCURRENCY = 10;

export type Candidate = {
  product: CatalogProduct;
  quantity: number;
  measured: number;
  notes: string[];
};

export type Priced = { candidate: Candidate; total: number; savings: number };

export type PriceSource = (candidates: Candidate[]) => Promise<(Priced | null)[]>;

export type PriceAlone = (candidate: Candidate, quantity: number) => Promise<Priced | null>;

type Sized = CatalogProduct & { sale: { kind: "packaged"; size: PackageSize } };

type Kept = { fits: CatalogProduct[]; note: string | null };

export function candidatesFor(item: Item, fits: CatalogProduct[]): Candidate[] {
  const { size, quantity } = item;
  const byWeightOnly = quantity.kind === "weight" && size.kind !== "exact";
  const kept: Kept = byWeightOnly ? { fits, note: null } : keepBySize(size, fits);
  const options = kept.fits.flatMap((product) => {
    const option = optionFor(item, product);
    return option ? [{ ...option, notes: [kept.note, ...option.notes] }] : [];
  });
  const preferred =
    quantity.kind === "units" && options.some(({ product }) => product.sale.kind === "packaged")
      ? options.filter(({ product }) => product.sale.kind === "packaged")
      : options;
  return preferred
    .map((option) => ({
      ...option,
      notes: option.notes.filter((note): note is string => note !== null),
    }))
    .sort(
      (a, b) =>
        compareNullable(snapshotPricePerUnit(a), snapshotPricePerUnit(b)) ||
        compareItemIds(a.product.itemId, b.product.itemId),
    )
    .slice(0, CANDIDATES_LIMIT);
}

export async function rankCandidates(
  candidatesPerItem: Candidate[][],
  prices: PriceSource,
): Promise<Priced[][]> {
  const queue = candidatesPerItem.flatMap((candidates, index) =>
    candidates.map((candidate) => ({ index, candidate })),
  );
  const priced = await prices(queue.map(({ candidate }) => candidate));
  return candidatesPerItem.map((_, index) =>
    rankBySelectionPolicy(
      queue.flatMap((queued, position) => {
        const found = priced[position];
        return queued.index === index && found ? [found] : [];
      }),
    ),
  );
}

export function rankBySelectionPolicy(priced: Priced[]): Priced[] {
  return [...priced].sort(
    (a, b) =>
      Number(b.savings > 0) - Number(a.savings > 0) ||
      pricePerUnit(a) - pricePerUnit(b) ||
      compareItemIds(a.candidate.product.itemId, b.candidate.product.itemId),
  );
}

export function pricePerUnit({ candidate, total }: Priced): number {
  return total / candidate.measured;
}

export const snapshotPrices: PriceSource = (candidates) =>
  Promise.resolve(candidates.map(snapshotPriced));

export function simulatedPrice(
  postalCode: string,
  store: OnlineStore,
  signal: AbortSignal,
): PriceAlone {
  return async (candidate, quantity) => {
    const { itemId } = candidate.product;
    const { lines } = await store.simulate({ postalCode, items: [{ itemId, quantity }] }, signal);
    const line = lines.find((simulated) => simulated.itemId === itemId);
    return line?.available ? { candidate, total: line.total, savings: line.savings } : null;
  };
}

export function simulatedPrices(priceAlone: PriceAlone, signal: AbortSignal): PriceSource {
  return (candidates) =>
    inParallel(candidates, SIMULATIONS_CONCURRENCY, signal, (candidate) =>
      priceAlone(candidate, candidate.quantity),
    );
}

export function candidateOf(item: Item, product: CatalogProduct): Candidate {
  const option =
    optionFor(item, product) ?? optionFor({ ...item, quantity: { kind: "minimum" } }, product)!;
  return {
    ...option,
    notes: option.notes.filter((note): note is string => note !== null),
  };
}

export function snapshotTotal({ product, quantity }: Candidate): number | null {
  if (product.price === null) return null;
  return product.sale.kind === "by-weight"
    ? product.price * quantity * product.sale.saleStepKg
    : product.price * quantity;
}

export function compareItemIds(a: string, b: string): number {
  const byNumber = Number(a) - Number(b);
  return Number.isNaN(byNumber) || byNumber === 0 ? a.localeCompare(b) : byNumber;
}

function snapshotPriced(candidate: Candidate): Priced | null {
  const total = snapshotTotal(candidate);
  return total === null ? null : { candidate, total, savings: 0 };
}

function snapshotPricePerUnit(candidate: Candidate): number | null {
  const priced = snapshotPriced(candidate);
  return priced === null ? null : pricePerUnit(priced);
}

function compareNullable(a: number | null, b: number | null): number {
  if (a === null || b === null) return Number(a === null) - Number(b === null);
  return a - b;
}

function keepBySize(size: Size, fits: CatalogProduct[]): Kept {
  const sized = fits.filter(isSized);
  switch (size.kind) {
    case "common":
      return keepCommon(fits, sized);
    case "biggest":
    case "smallest":
      return keepExtreme(size.kind, fits, sized);
    case "exact":
      return keepExact(size, fits, sized);
  }
}

function keepCommon(fits: CatalogProduct[], sized: Sized[]): Kept {
  if (sized.length === 0) return { fits, note: null };
  const groups = new Map<string, Sized[]>();
  for (const product of sized) {
    const key = sizeKey(product.sale.size);
    groups.set(key, [...(groups.get(key) ?? []), product]);
  }
  const mostFits = Math.max(...[...groups.values()].map((group) => group.length));
  const cheapestPerUnit = (group: Sized[]) =>
    Math.min(
      ...group.map(
        (product) =>
          snapshotPricePerUnit({
            product,
            quantity: 1,
            measured: product.sale.size.amount,
            notes: [],
          }) ?? Number.POSITIVE_INFINITY,
      ),
    );
  const [mode] = [...groups.values()]
    .filter((group) => group.length === mostFits)
    .sort((a, b) => cheapestPerUnit(a) - cheapestPerUnit(b));
  const modeKey = sizeKey(mode![0]!.sale.size);
  return {
    fits: fits.filter((product) => !isSized(product) || sizeKey(product.sale.size) === modeKey),
    note: null,
  };
}

function keepExtreme(kind: "biggest" | "smallest", fits: CatalogProduct[], sized: Sized[]): Kept {
  if (sized.length === 0) {
    const wanted = kind === "biggest" ? "el más grande" : "el más chico";
    return { fits, note: `Carrefour no lo vende por tamaño: no pude elegir ${wanted}` };
  }
  const dimension = majorityDimension(sized);
  const ofDimension = sized.filter(({ sale }) => sale.size.dimension === dimension);
  const amounts = ofDimension.map(({ sale }) => sale.size.amount);
  const target = kind === "biggest" ? Math.max(...amounts) : Math.min(...amounts);
  return {
    fits: ofDimension.filter(({ sale }) => sameAmount(sale.size.amount, target)),
    note: null,
  };
}

function keepExact(size: Size & { kind: "exact" }, fits: CatalogProduct[], sized: Sized[]): Kept {
  const asked = measureText(size.dimension, size.amount);
  const ofDimension = sized.filter(({ sale }) => sale.size.dimension === size.dimension);
  if (ofDimension.length === 0) return { fits, note: `No hay de ${asked}` };
  const exact = ofDimension.filter(({ sale }) => sameAmount(sale.size.amount, size.amount));
  if (exact.length > 0) return { fits: exact, note: null };
  const [nearest] = ofDimension
    .map(({ sale }) => sale.size.amount)
    .sort((a, b) => Math.abs(a - size.amount) - Math.abs(b - size.amount) || b - a);
  return {
    fits: ofDimension.filter(({ sale }) => sameAmount(sale.size.amount, nearest!)),
    note: `No hay de ${asked}; llevo ${measureText(size.dimension, nearest!)}`,
  };
}

function optionFor(
  item: Item,
  product: CatalogProduct,
): {
  product: CatalogProduct;
  quantity: number;
  measured: number;
  notes: (string | null)[];
} | null {
  const { quantity } = item;
  if (product.sale.kind === "by-weight") {
    return byWeightOption(item, product, product.sale.saleStepKg);
  }
  const { size } = product.sale;
  if (quantity.kind === "weight") {
    if (size?.dimension !== "weight") return null;
    const packages = Math.ceil(roundMeasure(quantity.grams / size.amount));
    return { product, quantity: packages, measured: quantity.grams, notes: [] };
  }
  const count = unitsOf(quantity);
  return { product, quantity: count, measured: count * (size?.amount ?? 1), notes: [] };
}

function byWeightOption(item: Item, product: CatalogProduct, stepKg: number) {
  const { quantity } = item;
  if (quantity.kind === "weight") {
    const askedKg = quantity.grams / 1000;
    const steps = Math.max(1, Math.ceil(roundMeasure(askedKg / stepKg)));
    const boughtKg = roundMeasure(steps * stepKg);
    const note =
      boughtKg === roundMeasure(askedKg)
        ? null
        : `${capitalized(item.product)} se vende de a ${kilosText(stepKg)}: llevo ${kilosText(boughtKg)}`;
    return {
      product,
      quantity: steps,
      measured: quantity.grams,
      notes: [note],
    };
  }
  const steps = unitsOf(quantity);
  const boughtKg = roundMeasure(steps * stepKg);
  const note =
    quantity.kind === "units" ? `Carrefour vende por kg: llevo ${kilosText(boughtKg)}` : null;
  return { product, quantity: steps, measured: boughtKg * 1000, notes: [note] };
}

function unitsOf(quantity: Quantity): number {
  return quantity.kind === "units" ? quantity.count : 1;
}

function isSized(product: CatalogProduct): product is Sized {
  return product.sale.kind === "packaged" && product.sale.size !== null;
}

function majorityDimension(sized: Sized[]): SizeDimension {
  const counts = new Map<SizeDimension, number>();
  for (const { sale } of sized) {
    counts.set(sale.size.dimension, (counts.get(sale.size.dimension) ?? 0) + 1);
  }
  const most = Math.max(...counts.values());
  return [...counts.entries()].find(([, count]) => count === most)![0];
}

function sizeKey(size: PackageSize): string {
  return `${size.dimension}:${roundMeasure(size.amount)}`;
}

function sameAmount(a: number, b: number): boolean {
  return roundMeasure(a) === roundMeasure(b);
}

const decimal = (value: number) => String(roundMeasure(value)).replace(".", ",");

const kilosText = (kg: number) => (kg < 1 ? `${Math.round(kg * 1000)} g` : `${decimal(kg)} kg`);

function measureText(dimension: SizeDimension, amount: number): string {
  switch (dimension) {
    case "volume":
      return amount < 1000 ? `${decimal(amount)} ml` : `${decimal(amount / 1000)} l`;
    case "weight":
      return amount < 1000 ? `${decimal(amount)} g` : `${decimal(amount / 1000)} kg`;
    case "units":
      return `${decimal(amount)} u`;
    case "length":
      return `${decimal(amount)} m`;
  }
}

function capitalized(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
