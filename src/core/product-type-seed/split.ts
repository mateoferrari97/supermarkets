export const GROCERY_DEPARTMENTS = [
  "Almacén",
  "Desayuno y merienda",
  "Bebidas",
  "Lácteos y productos frescos",
  "Carnes y pescados",
  "Frutas y verduras",
  "Panadería",
  "Congelados",
  "Limpieza",
  "Perfumería y farmacia",
] as const;

export const MAX_TIPOS_PER_PART = 220;
export const EXAMPLES_PER_TIPO = 5;
export const FAMILIAS_PER_TIPO = 5;

export type CatalogProduct = {
  name: string;
  department: string;
  availableQuantity: number;
  seccion: string | null;
  familia: string | null;
  tipo: string | null;
  measureUnit: string | null;
};

export type Count = { name: string; count: number };

export type PartTipo = {
  tipo: string;
  products: number;
  availableProducts: number;
  familias: Count[];
  measureUnits: Count[];
  examples: string[];
};

export type Part = { id: string; department: string; tipos: PartTipo[] };

const groceryDepartments = new Set<string>(GROCERY_DEPARTMENTS);

export function splitIntoParts(products: CatalogProduct[]): Part[] {
  const productsByTipo = new Map<string, CatalogProduct[]>();
  for (const product of products) {
    if (!product.tipo || !groceryDepartments.has(product.department)) continue;
    const group = productsByTipo.get(product.tipo) ?? [];
    group.push(product);
    productsByTipo.set(product.tipo, group);
  }

  const tiposByDepartment = new Map<string, { seccion: string; tipo: PartTipo }[]>();
  for (const [tipo, tipoProducts] of productsByTipo) {
    const department = mostCommon(tipoProducts.map((product) => product.department));
    const entries = tiposByDepartment.get(department) ?? [];
    entries.push({
      seccion: mostCommon(tipoProducts.map((product) => product.seccion ?? "")),
      tipo: summarize(tipo, tipoProducts),
    });
    tiposByDepartment.set(department, entries);
  }

  return GROCERY_DEPARTMENTS.flatMap((department) => {
    const entries = (tiposByDepartment.get(department) ?? []).sort(
      (a, b) => compare(a.seccion, b.seccion) || compare(a.tipo.tipo, b.tipo.tipo),
    );
    if (entries.length === 0) return [];
    const tipos = entries.map((entry) => entry.tipo);
    const partCount = Math.ceil(tipos.length / MAX_TIPOS_PER_PART);
    if (partCount === 1) return [{ id: slug(department), department, tipos }];
    const size = Math.ceil(tipos.length / partCount);
    return Array.from({ length: partCount }, (_, index) => ({
      id: `${slug(department)}-${index + 1}`,
      department,
      tipos: tipos.slice(index * size, (index + 1) * size),
    }));
  });
}

function summarize(tipo: string, products: CatalogProduct[]): PartTipo {
  const available = products.filter((product) => product.availableQuantity > 0);
  const unavailable = products.filter((product) => product.availableQuantity <= 0);
  return {
    tipo,
    products: products.length,
    availableProducts: available.length,
    familias: counts(products.map((product) => product.familia)).slice(0, FAMILIAS_PER_TIPO),
    measureUnits: counts(products.map((product) => product.measureUnit)),
    examples: [...available, ...unavailable]
      .slice(0, EXAMPLES_PER_TIPO)
      .map((product) => product.name),
  };
}

function counts(values: (string | null)[]): Count[] {
  const tally = new Map<string, number>();
  for (const value of values) {
    if (value) tally.set(value, (tally.get(value) ?? 0) + 1);
  }
  return [...tally]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || compare(a.name, b.name));
}

function mostCommon(values: string[]): string {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);
  const [winner] = [...tally].sort((a, b) => b[1] - a[1] || compare(a[0], b[0]));
  return winner?.[0] ?? "";
}

function compare(a: string, b: string): number {
  return a.localeCompare(b, "es");
}

function slug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
