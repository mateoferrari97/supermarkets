export type SizeDimension = "volume" | "weight" | "units" | "length";

export type PackageSize = { dimension: SizeDimension; amount: number };

export type Teaser = { name: string; minimumQuantity: number };

export type Sale =
  { kind: "by-weight"; saleStepKg: number } | { kind: "packaged"; size: PackageSize | null };

export type CatalogProduct = {
  productId: string;
  itemId: string;
  name: string;
  brand: string | null;
  department: string;
  tipo: string | null;
  price: number | null;
  inStock: boolean;
  sale: Sale;
  teasers: Teaser[];
};

export type SnapshotRecord = {
  productId: string;
  skuIds: string[];
  name: string;
  brand: string | null;
  department: string;
  tipo: string | null;
  price: number | null;
  availableQuantity: number;
  measureUnit: string | null;
  consumptionQuantity: string | null;
  measurementUnit: string | null;
  unitMultiplier: number | null;
  teasers: Teaser[];
};

const MEASURE_UNITS: Record<string, { dimension: SizeDimension; factor: number }> = {
  ML: { dimension: "volume", factor: 1 },
  ML1: { dimension: "volume", factor: 1 },
  MIL: { dimension: "volume", factor: 1 },
  CM3: { dimension: "volume", factor: 1 },
  LTR: { dimension: "volume", factor: 1000 },
  GRM: { dimension: "weight", factor: 1 },
  GRS: { dimension: "weight", factor: 1 },
  GR1: { dimension: "weight", factor: 1 },
  KGM: { dimension: "weight", factor: 1000 },
  UNI: { dimension: "units", factor: 1 },
  UN1: { dimension: "units", factor: 1 },
  MTR: { dimension: "length", factor: 1 },
};

export function packageSize(
  measureUnit: string | null,
  consumptionQuantity: string | null,
): PackageSize | null {
  const unit = MEASURE_UNITS[measureUnit ?? ""];
  if (!unit || consumptionQuantity === null || !/^\d+(\.\d+)?$/.test(consumptionQuantity)) {
    return null;
  }
  const amount = Number(consumptionQuantity);
  if (amount <= 0) return null;
  return { dimension: unit.dimension, amount: Math.round(amount * unit.factor * 1000) / 1000 };
}

function saleOf(record: SnapshotRecord): Sale {
  if (record.measurementUnit === "kg" && record.unitMultiplier !== null) {
    return { kind: "by-weight", saleStepKg: record.unitMultiplier };
  }
  return { kind: "packaged", size: packageSize(record.measureUnit, record.consumptionQuantity) };
}

export function catalogProductsFrom(records: SnapshotRecord[]): CatalogProduct[] {
  return records.flatMap((record): CatalogProduct[] => {
    const [itemId] = record.skuIds;
    if (itemId === undefined) return [];
    return [
      {
        productId: record.productId,
        itemId,
        name: record.name,
        brand: record.brand,
        department: record.department,
        tipo: record.tipo,
        price: record.price,
        inStock: record.availableQuantity > 0,
        sale: saleOf(record),
        teasers: record.teasers,
      },
    ];
  });
}
