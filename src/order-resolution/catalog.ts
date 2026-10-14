import { normalize } from "./text.ts";

export type Size = { dimension: "volume" | "weight"; amount: number; label: string };

const SIZE =
  /(\d+(?:[.,]\d+)?)\s*(ml|cc|cm3|litros?|lts?|l|kgs?|kilos?|grs?|gramos?|g)(?![\p{L}\p{N}])/giu;

const UNITS: Record<string, { dimension: Size["dimension"]; factor: number; unit: string }> = {
  ml: { dimension: "volume", factor: 1, unit: "ml" },
  cc: { dimension: "volume", factor: 1, unit: "ml" },
  cm3: { dimension: "volume", factor: 1, unit: "ml" },
  l: { dimension: "volume", factor: 1000, unit: "l" },
  lt: { dimension: "volume", factor: 1000, unit: "l" },
  lts: { dimension: "volume", factor: 1000, unit: "l" },
  litro: { dimension: "volume", factor: 1000, unit: "l" },
  litros: { dimension: "volume", factor: 1000, unit: "l" },
  g: { dimension: "weight", factor: 1, unit: "g" },
  gr: { dimension: "weight", factor: 1, unit: "g" },
  grs: { dimension: "weight", factor: 1, unit: "g" },
  gramo: { dimension: "weight", factor: 1, unit: "g" },
  gramos: { dimension: "weight", factor: 1, unit: "g" },
  kg: { dimension: "weight", factor: 1000, unit: "kg" },
  kgs: { dimension: "weight", factor: 1000, unit: "kg" },
  kilo: { dimension: "weight", factor: 1000, unit: "kg" },
  kilos: { dimension: "weight", factor: 1000, unit: "kg" },
};

export function sizesIn(text: string): Size[] {
  return [...text.matchAll(SIZE)].flatMap(([, number = "", unitText = ""]) => {
    const unit = UNITS[unitText.toLowerCase()];
    if (!unit) return [];
    const value = Number(number.replace(",", "."));
    return [
      {
        dimension: unit.dimension,
        amount: Math.round(value * unit.factor * 1000) / 1000,
        label: `${number.replace(".", ",")} ${unit.unit}`,
      },
    ];
  });
}

const sameSize = (a: Size, b: Size) => a.dimension === b.dimension && a.amount === b.amount;

export function nameMatchesTerm(name: string, term: string): boolean {
  const [size, ...others] = sizesIn(term);
  if (size && others.length === 0)
    return sizesIn(name).some((candidate) => sameSize(candidate, size));
  return ` ${normalize(name)} `.includes(` ${normalize(term)} `);
}

export function productMatchesBrand(
  product: { name: string; brand: string | null },
  brand: string,
) {
  const wanted = normalize(brand);
  return (
    normalize(product.brand ?? "") === wanted ||
    ` ${normalize(product.name)} `.includes(` ${wanted} `)
  );
}

export function distinctSizes(names: string[]): Size[] {
  const sizes: Size[] = [];
  for (const size of names.flatMap(sizesIn)) {
    if (!sizes.some((known) => sameSize(known, size))) sizes.push(size);
  }
  return sizes.sort((a, b) => a.dimension.localeCompare(b.dimension) || a.amount - b.amount);
}
