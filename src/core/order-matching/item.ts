import type { Measure } from "../product-selection/concepts.ts";

export type Size =
  { kind: "common" } | { kind: "biggest" } | { kind: "smallest" } | ({ kind: "exact" } & Measure);

export type Quantity =
  { kind: "minimum" } | { kind: "units"; count: number } | { kind: "weight"; grams: number };

export type Item = {
  original: string;
  product: string;
  brand: string | null;
  size: Size;
  quantity: Quantity;
};

export type ItemLine = {
  original: string;
  product: string;
  brand: string | null;
  size: string;
  quantity: string;
};

export type LineParse = { ok: true; item: Item } | { ok: false; failure: string };

const AMOUNT = String.raw`\d+(\.\d+)?`;

export const SIZE_PATTERN = new RegExp(`^(common|biggest|smallest|${AMOUNT} (ml|l|g|kg))$`);
export const QUANTITY_PATTERN = new RegExp(String.raw`^(minimum|\d+ unit|${AMOUNT} (g|kg))$`);

const MEASURES: Record<string, { dimension: Measure["dimension"]; factor: number }> = {
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  g: { dimension: "weight", factor: 1 },
  kg: { dimension: "weight", factor: 1000 },
};

export const roundMeasure = (amount: number): number => Math.round(amount * 1000) / 1000;

export function parseSize(text: string): Size | null {
  if (!SIZE_PATTERN.test(text)) return null;
  if (text === "common" || text === "biggest" || text === "smallest") return { kind: text };
  const measure = parseMeasure(text);
  return measure ? { kind: "exact", ...measure } : null;
}

export function parseQuantity(text: string): Quantity | null {
  if (!QUANTITY_PATTERN.test(text)) return null;
  if (text === "minimum") return { kind: "minimum" };
  const [amount, unit] = text.split(" ");
  if (unit === "unit") {
    const count = Number(amount);
    return count > 0 ? { kind: "units", count } : null;
  }
  const measure = parseMeasure(text);
  return measure ? { kind: "weight", grams: measure.amount } : null;
}

export function parseLine(line: ItemLine): LineParse {
  const size = parseSize(line.size);
  const quantity = parseQuantity(line.quantity);
  if (!size || !quantity) {
    return {
      ok: false,
      failure: `"${line.original}" has size "${line.size}" and quantity "${line.quantity}"`,
    };
  }
  return {
    ok: true,
    item: { original: line.original, product: line.product, brand: line.brand, size, quantity },
  };
}

function parseMeasure(text: string): Measure | null {
  const [number, unit] = text.split(" ");
  const { dimension, factor } = MEASURES[unit!]!;
  const amount = roundMeasure(Number(number) * factor);
  return amount > 0 ? { dimension, amount } : null;
}
