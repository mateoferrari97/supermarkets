import type { Quantity, Size } from "./item.ts";

export type ItemLineCase = {
  size: string;
  quantity: string;
  parsed: { size: Size; quantity: Quantity } | null;
};

const minimum: Quantity = { kind: "minimum" };
const common: Size = { kind: "common" };

const sizes: [string, Size | null][] = [
  ["common", { kind: "common" }],
  ["biggest", { kind: "biggest" }],
  ["smallest", { kind: "smallest" }],
  ["500 ml", { kind: "exact", dimension: "volume", amount: 500 }],
  ["2.25 l", { kind: "exact", dimension: "volume", amount: 2250 }],
  ["1.1 l", { kind: "exact", dimension: "volume", amount: 1100 }],
  ["1 l", { kind: "exact", dimension: "volume", amount: 1000 }],
  ["300 g", { kind: "exact", dimension: "weight", amount: 300 }],
  ["1.5 kg", { kind: "exact", dimension: "weight", amount: 1500 }],
  ["0.5 kg", { kind: "exact", dimension: "weight", amount: 500 }],
  ["0.0005 l", { kind: "exact", dimension: "volume", amount: 0.5 }],
  ["0.3333333 l", { kind: "exact", dimension: "volume", amount: 333.333 }],
  ["0.0001 g", null],
  ["", null],
  ["grande", null],
  ["2,25 l", null],
  ["2.25l", null],
  ["2.25 lts", null],
  ["2 unit", null],
  ["0 ml", null],
  ["0.0 kg", null],
  ["-1 l", null],
  [".5 l", null],
  ["1 l ", null],
  ["Common", null],
];

const quantities: [string, Quantity | null][] = [
  ["minimum", { kind: "minimum" }],
  ["1 unit", { kind: "units", count: 1 }],
  ["12 unit", { kind: "units", count: 12 }],
  ["300 g", { kind: "weight", grams: 300 }],
  ["2 kg", { kind: "weight", grams: 2000 }],
  ["1.5 kg", { kind: "weight", grams: 1500 }],
  ["0.25 kg", { kind: "weight", grams: 250 }],
  ["0.0004 g", null],
  ["", null],
  ["2", null],
  ["2 units", null],
  ["1.5 unit", null],
  ["0 unit", null],
  ["2 l", null],
  ["500 ml", null],
  ["0 kg", null],
  ["1,5 kg", null],
  ["common", null],
];

export const ITEM_LINE_CASES: ItemLineCase[] = [
  ...sizes.map(([size, parsed]) => ({
    size,
    quantity: "minimum",
    parsed: parsed && { size: parsed, quantity: minimum },
  })),
  ...quantities.map(([quantity, parsed]) => ({
    size: "common",
    quantity,
    parsed: parsed && { size: common, quantity: parsed },
  })),
];
