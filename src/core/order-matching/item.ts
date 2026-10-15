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

export type ParseOrderOutput = {
  items: Item[];
  ignoredPreference: boolean;
};

const AMOUNT = /^(\d+(?:\.\d+)?) (ml|l|g|kg)$/;
const UNITS = /^(\d+) unit$/;

const MEASURES: Record<string, { dimension: Measure["dimension"]; factor: number }> = {
  ml: { dimension: "volume", factor: 1 },
  l: { dimension: "volume", factor: 1000 },
  g: { dimension: "weight", factor: 1 },
  kg: { dimension: "weight", factor: 1000 },
};

export function parseSize(text: string): Size | null {
  if (text === "common" || text === "biggest" || text === "smallest") return { kind: text };
  const measure = parseMeasure(text);
  return measure ? { kind: "exact", ...measure } : null;
}

export function parseQuantity(text: string): Quantity | null {
  if (text === "minimum") return { kind: "minimum" };
  const units = UNITS.exec(text);
  if (units) {
    const count = Number(units[1]);
    return count > 0 ? { kind: "units", count } : null;
  }
  const measure = parseMeasure(text);
  return measure?.dimension === "weight" ? { kind: "weight", grams: measure.amount } : null;
}

function parseMeasure(text: string): Measure | null {
  const match = AMOUNT.exec(text);
  if (!match) return null;
  const { dimension, factor } = MEASURES[match[2]!]!;
  const amount = Math.round(Number(match[1]) * factor * 1e6) / 1e6;
  return amount > 0 ? { dimension, amount } : null;
}
