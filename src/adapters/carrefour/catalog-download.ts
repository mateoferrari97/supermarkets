import { z } from "zod";
import type { Teaser } from "../../core/order-matching/catalog-product.ts";

const BASE_URL = "https://www.carrefour.com.ar";
const SELLER_ID = "1";
const PAGE_SIZE = 50;
const MAX_FROM = 2500;
const WINDOW = MAX_FROM + PAGE_SIZE;
const CONCURRENCY = 8;
const MAX_ATTEMPTS = 4;

type Category = { id: number; name: string; children: Category[] };

const categorySchema: z.ZodType<Category> = z.object({
  id: z.number(),
  name: z.string(),
  get children() {
    return z.array(categorySchema);
  },
});

const teaserSchema = z.object({
  Name: z.string(),
  Conditions: z.object({ MinimumQuantity: z.number().nullish() }),
});

const offerSchema = z.object({
  Price: z.number(),
  ListPrice: z.number(),
  AvailableQuantity: z.number(),
  PromotionTeasers: z.array(teaserSchema).nullish(),
});

const productSchema = z.looseObject({
  productId: z.string(),
  productName: z.string(),
  brand: z.string().nullish(),
  categories: z.array(z.string()).default([]),
  items: z.array(
    z.object({
      itemId: z.string(),
      ean: z.string().nullish(),
      measurementUnit: z.string().nullish(),
      unitMultiplier: z.number().nullish(),
      sellers: z.array(z.object({ sellerId: z.string(), commertialOffer: offerSchema })),
    }),
  ),
});

type RawProduct = z.infer<typeof productSchema>;

type Node = { category: Category; path: string; department: string };

export type CatalogProduct = {
  productId: string;
  skuIds: string[];
  ean: string | null;
  name: string;
  brand: string | null;
  category: string | null;
  department: string;
  price: number | null;
  listPrice: number | null;
  availableQuantity: number;
  sector: string | null;
  seccion: string | null;
  grupo: string | null;
  familia: string | null;
  subfamilia: string | null;
  tipo: string | null;
  measureUnit: string | null;
  consumptionQuantity: string | null;
  conversionFactor: string | null;
  unitPrice: string | null;
  measurementUnit: string | null;
  unitMultiplier: number | null;
  teasers: Teaser[];
};

type Page = { products: RawProduct[]; total: number };

type CategoryResult = {
  node: Node;
  total: number;
  products: RawProduct[];
  children: Node[];
};

export type CatalogMeta = {
  fetchedAt: string;
  source: string;
  sellerId: string;
  catalogTotal: number | null;
  categoriesFetched: number;
  productsListed: number;
  uniqueProducts: number;
  availableProducts: number;
  productsWithoutTipo: number;
  productsSoldByWeight: number;
  productsWithTeasers: number;
  distinctTipos: number;
  productsByDepartment: Record<string, number>;
  incompleteCategories: { path: string; name: string; total: number; fetched: number }[];
  productsOnlyInSplitCategories: {
    path: string;
    name: string;
    total: number;
    childrenTotal: number;
  }[];
};

export type DownloadedCatalog = {
  meta: CatalogMeta;
  products: CatalogProduct[];
};

let activeRequests = 0;
const waitingRequests: (() => void)[] = [];

async function withRequestSlot<T>(task: () => Promise<T>): Promise<T> {
  if (activeRequests >= CONCURRENCY) {
    await new Promise<void>((resolve) => waitingRequests.push(resolve));
  }
  activeRequests++;
  try {
    return await task();
  } finally {
    activeRequests--;
    waitingRequests.shift()?.();
  }
}

async function get(url: string): Promise<{ body: unknown; total: number | null }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await withRequestSlot(() =>
        fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } }),
      );
      if (response.ok) {
        const total = /\/(\d+)$/.exec(response.headers.get("resources") ?? "")?.[1];
        return { body: await response.json(), total: total === undefined ? null : Number(total) };
      }
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`HTTP ${String(response.status)} for ${url}`);
      }
      if (attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${String(response.status)} for ${url}`);
    } catch (error) {
      if (attempt >= MAX_ATTEMPTS) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
  }
}

function searchUrl(filter: string, from: number, order?: string): string {
  const query = [
    filter,
    order && `O=${order}`,
    `_from=${String(from)}`,
    `_to=${String(from + PAGE_SIZE - 1)}`,
  ]
    .filter(Boolean)
    .join("&");
  return `${BASE_URL}/api/catalog_system/pub/products/search?${query}`;
}

async function fetchPage(filter: string, from: number, order?: string): Promise<Page> {
  const page = await get(searchUrl(filter, from, order));
  return { products: z.array(productSchema).parse(page.body), total: page.total ?? 0 };
}

async function fetchWindow(filter: string, order?: string, first?: Page): Promise<RawProduct[]> {
  const firstPage = first ?? (await fetchPage(filter, 0, order));
  const end = Math.min(firstPage.total, WINDOW);
  const offsets: number[] = [];
  for (let from = PAGE_SIZE; from < end; from += PAGE_SIZE) offsets.push(from);
  const pages = await Promise.all(offsets.map((from) => fetchPage(filter, from, order)));
  return [firstPage, ...pages].flatMap((page) => page.products);
}

async function fetchCategory(node: Node, onDone: () => void): Promise<CategoryResult[]> {
  const filter = `fq=C:/${node.path}/`;
  const first = await fetchPage(filter, 0);
  const children = node.category.children.map((child) => ({
    category: child,
    path: `${node.path}/${String(child.id)}`,
    department: node.department,
  }));
  if (first.total > WINDOW && children.length > 0) {
    onDone();
    const nested = await Promise.all(children.map((child) => fetchCategory(child, onDone)));
    return [{ node, total: first.total, products: [], children }, ...nested.flat()];
  }
  const products =
    first.total <= WINDOW
      ? await fetchWindow(filter, undefined, first)
      : [
          ...(await fetchWindow(filter, "OrderByNameASC")),
          ...(await fetchWindow(filter, "OrderByNameDESC")),
        ];
  onDone();
  return [{ node, total: first.total, products, children: [] }];
}

function specification(product: RawProduct, key: string): string | null {
  const value: unknown = product[key];
  if (!Array.isArray(value)) return null;
  const first: unknown = value[0];
  return typeof first === "string" && first.trim() !== "" ? first.trim() : null;
}

function toProduct(raw: RawProduct, department: string): CatalogProduct {
  const item = raw.items[0];
  const offer = item?.sellers.find((seller) => seller.sellerId === SELLER_ID)?.commertialOffer;
  return {
    productId: raw.productId,
    skuIds: raw.items.map((sku) => sku.itemId),
    ean: item?.ean ?? null,
    name: raw.productName,
    brand: raw.brand ?? null,
    category: raw.categories[0] ?? null,
    department,
    price: offer?.Price ?? null,
    listPrice: offer?.ListPrice ?? null,
    availableQuantity: offer?.AvailableQuantity ?? 0,
    sector: specification(raw, "EC_Sector"),
    seccion: specification(raw, "EC_Sección"),
    grupo: specification(raw, "EC_Grupo"),
    familia: specification(raw, "EC_Familia"),
    subfamilia: specification(raw, "EC_Subfamilia"),
    tipo: specification(raw, "Tipo de producto"),
    measureUnit: specification(raw, "Gramaje de unidad de medida"),
    consumptionQuantity: specification(raw, "Gramaje de unidad de consumo"),
    conversionFactor: specification(raw, "Gramaje factor de conversión"),
    unitPrice: specification(raw, "Precio x unidad"),
    measurementUnit: item?.measurementUnit ?? null,
    unitMultiplier: item?.unitMultiplier ?? null,
    teasers: (offer?.PromotionTeasers ?? []).flatMap((teaser) =>
      typeof teaser.Conditions.MinimumQuantity === "number"
        ? [{ name: teaser.Name, minimumQuantity: teaser.Conditions.MinimumQuantity }]
        : [],
    ),
  };
}

export function catalogProductsFrom(page: unknown, department: string): CatalogProduct[] {
  return z
    .array(productSchema)
    .parse(page)
    .map((raw) => toProduct(raw, department));
}

function increment(counts: Record<string, number>, key: string | null) {
  const name = key ?? "(none)";
  counts[name] = (counts[name] ?? 0) + 1;
}

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([, a], [, b]) => b - a));
}

export async function downloadCatalog(
  onCategory: (done: number) => void = () => undefined,
): Promise<DownloadedCatalog> {
  const fetchedAt = new Date().toISOString();
  const tree = z
    .array(categorySchema)
    .parse((await get(`${BASE_URL}/api/catalog_system/pub/category/tree/4`)).body);
  const catalogTotal = (await get(searchUrl("", 0))).total;
  const roots = tree.map((category) => ({
    category,
    path: String(category.id),
    department: category.name,
  }));

  let done = 0;
  const onDone = () => {
    onCategory(++done);
  };
  const results = (await Promise.all(roots.map((root) => fetchCategory(root, onDone)))).flat();

  const products = new Map<string, CatalogProduct>();
  let listed = 0;
  for (const result of results) {
    listed += result.products.length;
    for (const raw of result.products) {
      if (!products.has(raw.productId)) {
        products.set(raw.productId, toProduct(raw, result.node.department));
      }
    }
  }
  const productList = [...products.values()].sort((a, b) =>
    a.productId.localeCompare(b.productId, "en", { numeric: true }),
  );

  const totals = new Map(results.map((result) => [result.node.path, result.total]));
  const fetched = results.filter((result) => result.children.length === 0);
  const incompleteCategories = fetched
    .map((result) => ({
      path: result.node.path,
      name: result.node.category.name,
      total: result.total,
      fetched: new Set(result.products.map((product) => product.productId)).size,
    }))
    .filter((category) => category.fetched < category.total);
  const productsOnlyInSplitCategories = results
    .filter((result) => result.children.length > 0)
    .map((result) => ({
      path: result.node.path,
      name: result.node.category.name,
      total: result.total,
      childrenTotal: result.children.reduce((sum, child) => sum + (totals.get(child.path) ?? 0), 0),
    }))
    .filter((category) => category.total > category.childrenTotal);

  const meta: CatalogMeta = {
    fetchedAt,
    source: BASE_URL,
    sellerId: SELLER_ID,
    catalogTotal,
    categoriesFetched: fetched.length,
    productsListed: listed,
    uniqueProducts: productList.length,
    availableProducts: productList.filter((product) => product.availableQuantity > 0).length,
    productsWithoutTipo: productList.filter((product) => product.tipo === null).length,
    productsSoldByWeight: productList.filter((product) => product.measurementUnit === "kg").length,
    productsWithTeasers: productList.filter((product) => product.teasers.length > 0).length,
    distinctTipos: new Set(productList.flatMap((product) => product.tipo ?? [])).size,
    productsByDepartment: sortedCounts(
      productList.reduce<Record<string, number>>((counts, product) => {
        increment(counts, product.department);
        return counts;
      }, {}),
    ),
    incompleteCategories,
    productsOnlyInSplitCategories,
  };

  return { meta, products: productList };
}
