import { z } from "zod";
import { sameBrand, sizesIn } from "../order-resolution/catalog.ts";
import { normalize } from "../order-resolution/text.ts";
import type {
  CandidateQuery,
  Delivery,
  Measure,
  OnlineStore,
  PaymentCard,
  Simulation,
  SimulationItem,
  SimulationRequest,
  SnapshotProduct,
  StoreProduct,
} from "./store.ts";

export const CARREFOUR_URL = "https://www.carrefour.com.ar";

export type HttpRequest = { method: "GET" | "POST"; url: string; body?: unknown };
export type HttpClient = (request: HttpRequest) => Promise<unknown>;

export class HttpError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(request: HttpRequest, status: number, body: unknown) {
    super(`Carrefour ${request.method} ${request.url} answered ${status}: ${JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

const regionsSchema = z.array(
  z.object({ id: z.string(), sellers: z.array(z.object({ id: z.string() })).default([]) }),
);

type Region = z.infer<typeof regionsSchema>[number];

const rejectionSchema = z.object({ error: z.object({ code: z.string() }) });

const facetsSchema = z.object({
  facets: z.array(
    z.object({
      key: z.string(),
      values: z.array(z.object({ name: z.string().nullish(), value: z.string().nullish() })),
    }),
  ),
});

const searchSchema = z.object({
  products: z.array(
    z.object({
      productId: z.string(),
      productName: z.string(),
      brand: z.string().nullish(),
      properties: z.array(z.object({ name: z.string(), values: z.array(z.string()) })).default([]),
      items: z.array(
        z.object({
          itemId: z.string(),
          measurementUnit: z.string().nullish(),
          unitMultiplier: z.number().nullish(),
          sellers: z
            .array(
              z.object({
                sellerId: z.string(),
                commertialOffer: z.object({
                  teasers: z
                    .array(
                      z.object({
                        name: z.string(),
                        conditions: z.object({ minimumQuantity: z.number() }).nullish(),
                      }),
                    )
                    .default([]),
                }),
              }),
            )
            .default([]),
        }),
      ),
    }),
  ),
});

const simulationSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      quantity: z.number(),
      availability: z.string(),
      priceTags: z.array(z.object({ name: z.string(), value: z.number() })).default([]),
      priceDefinition: z.object({ total: z.number() }).nullish(),
    }),
  ),
  ratesAndBenefitsData: z
    .object({
      rateAndBenefitsIdentifiers: z.array(z.object({ id: z.string(), name: z.string() })),
    })
    .nullish(),
});

const UNITS: Record<string, { dimension: Measure["dimension"]; factor: number }> = {
  CM3: { dimension: "volume", factor: 1 },
  ML: { dimension: "volume", factor: 1 },
  ML1: { dimension: "volume", factor: 1 },
  MIL: { dimension: "volume", factor: 1 },
  LTR: { dimension: "volume", factor: 1000 },
  LM1: { dimension: "volume", factor: 1000 },
  GRM: { dimension: "weight", factor: 1 },
  GRS: { dimension: "weight", factor: 1 },
  GR1: { dimension: "weight", factor: 1 },
  KGM: { dimension: "weight", factor: 1000 },
};

export function createCarrefourStore(http: HttpClient = fetchJson): OnlineStore {
  const regions = new Map<string, Promise<Region | null>>();
  const tipoSlugs = new Map<string, Promise<string | null>>();

  const search = (path: string, params: Record<string, string>) =>
    `${CARREFOUR_URL}/api/intelligent-search/v1/${path}?${new URLSearchParams({ sc: "1", ...params })}`;

  const regionFor = (postalCode: string) => {
    const known = regions.get(postalCode);
    if (known) return known;
    const url = `${CARREFOUR_URL}/api/checkout/pub/regions?${new URLSearchParams({ country: "ARG", postalCode })}`;
    const region = http({ method: "GET", url }).then(
      (body) => regionsSchema.parse(body)[0] ?? null,
    );
    regions.set(postalCode, region);
    region.catch(() => regions.delete(postalCode));
    return region;
  };

  const checkDelivery = async (postalCode: string): Promise<Delivery> => {
    try {
      const region = await regionFor(postalCode);
      return region && region.sellers.length > 0 ? "delivers" : "does-not-deliver";
    } catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        const rejection = rejectionSchema.safeParse(error.body);
        if (rejection.success && rejection.data.error.code === "ORD006") {
          return "postal-code-rejected";
        }
      }
      throw error;
    }
  };

  const facetValue = async (
    path: string,
    params: Record<string, string>,
    key: string,
    name: string,
  ) => {
    const body = facetsSchema.parse(await http({ method: "GET", url: search(path, params) }));
    const wanted = normalize(name);
    const values = body.facets.find((candidate) => candidate.key === key)?.values ?? [];
    const exact = values.find((value) => normalize(value.name ?? "") === wanted);
    const close =
      key === "brand" ? values.find((value) => sameBrand(name, value.name ?? "")) : undefined;
    return (exact ?? close)?.value ?? null;
  };

  const slugForTipo = (tipo: string) => {
    const known = tipoSlugs.get(tipo);
    if (known) return known;
    const slug = facetValue("facets/trade-policy/1", { query: tipo }, "tipo-de-producto", tipo);
    tipoSlugs.set(tipo, slug);
    return slug;
  };

  const slugsForBrands = async (
    tipoPath: string,
    region: Record<string, string>,
    brands: string[],
  ) => {
    const slugs = await Promise.all(
      brands.map((brand) =>
        facetValue(`facets/trade-policy/1/${tipoPath}`, region, "brand", brand),
      ),
    );
    return slugs.filter((slug): slug is string => slug !== null);
  };

  const findCandidates = async ({ postalCode, tipos, brands, sort, limit }: CandidateQuery) => {
    const [found, ...slugs] = await Promise.all([regionFor(postalCode), ...tipos.map(slugForTipo)]);
    if (!found) throw new Error(`Carrefour has no region for postal code ${postalCode}`);
    const tipoPath = slugs
      .filter((slug): slug is string => slug !== null)
      .map((slug) => `tipo-de-producto/${slug}`)
      .join("/");
    if (!tipoPath) return [];
    const region = { regionId: found.id };
    let facets = tipoPath;
    if (brands.length > 0) {
      const brandSlugs = await slugsForBrands(tipoPath, region, brands);
      if (brandSlugs.length === 0) return [];
      facets = [tipoPath, ...brandSlugs.map((slug) => `brand/${slug}`)].join("/");
    }
    const url = search(`product-search/trade-policy/1/${facets}`, {
      ...region,
      hideUnavailableItems: "true",
      sort,
      count: String(limit),
      page: "1",
    });
    const body = searchSchema.parse(await http({ method: "GET", url }));
    return body.products.flatMap((product): StoreProduct[] => {
      const item = product.items[0];
      if (!item) return [];
      return [
        {
          productId: product.productId,
          itemId: item.itemId,
          name: product.productName,
          brand: product.brand ?? null,
          measure: measureOf(product.productName, product.properties, item),
          weightStepKg: item.measurementUnit === "kg" ? (item.unitMultiplier ?? 1) : null,
          teasers: (
            item.sellers.find(({ sellerId }) => sellerId === "1")?.commertialOffer.teasers ?? []
          ).map(({ name, conditions }) => ({
            name,
            minimumQuantity: conditions?.minimumQuantity ?? 0,
          })),
        },
      ];
    });
  };

  const simulate = async ({ postalCode, card, items }: SimulationRequest): Promise<Simulation> => {
    const url = `${CARREFOUR_URL}/api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0`;
    const body = simulationSchema.parse(
      await http({
        method: "POST",
        url,
        body: {
          items: items.map(({ itemId, quantity }) => ({ id: itemId, quantity, seller: "1" })),
          country: "ARG",
          postalCode,
          ...(card ? { paymentData: { payments: [payment(card)] } } : {}),
        },
      }),
    );
    const benefits = body.ratesAndBenefitsData?.rateAndBenefitsIdentifiers ?? [];
    const lines = body.items.map((line) => {
      const discounts = line.priceTags.filter(({ value }) => value < 0);
      const promotions = benefits
        .filter(({ id }) => discounts.some(({ name }) => name.includes(id)))
        .map(({ name }) => name);
      return {
        itemId: line.id,
        quantity: line.quantity,
        available: line.availability === "available",
        total: (line.priceDefinition?.total ?? 0) / 100,
        savings: -discounts.reduce((sum, { value }) => sum + value, 0) / 100,
        promotions,
      };
    });
    const total = lines
      .filter(({ available }) => available)
      .reduce((sum, line) => sum + line.total, 0);
    return { lines, total };
  };

  return { checkDelivery, findCandidates, simulate, cartLink };
}

function cartLink(items: SimulationItem[]): string {
  const params = new URLSearchParams();
  for (const { itemId, quantity } of items) {
    params.append("sku", itemId);
    params.append("qty", String(quantity));
    params.append("seller", "1");
  }
  params.append("sc", "1");
  return `${CARREFOUR_URL}/checkout/cart/add?${params}`;
}

export type SnapshotRecord = {
  productId: string;
  skuIds: string[];
  name: string;
  brand?: string | null;
  tipo: string | null;
  measureUnit: string | null;
  consumptionQuantity: string | null;
};

export function snapshotProducts(records: SnapshotRecord[]): SnapshotProduct[] {
  return records.flatMap((record): SnapshotProduct[] => {
    const [itemId] = record.skuIds;
    if (itemId === undefined || record.tipo === null) return [];
    const properties = [
      { name: "Gramaje de unidad de medida", values: [record.measureUnit ?? ""] },
      { name: "Gramaje de unidad de consumo", values: [record.consumptionQuantity ?? ""] },
    ];
    return [
      {
        productId: record.productId,
        itemId,
        name: record.name,
        brand: record.brand ?? null,
        measure: measureOf(record.name, properties, {}),
        weightStepKg: null,
        teasers: [],
        tipo: record.tipo,
      },
    ];
  });
}

function payment({ paymentSystem, bin }: PaymentCard) {
  return {
    paymentSystem,
    ...(bin ? { bin } : {}),
    installments: 1,
    value: 0,
    referenceValue: 0,
  };
}

function measureOf(
  productName: string,
  properties: { name: string; values: string[] }[],
  item: { measurementUnit?: string | null; unitMultiplier?: number | null },
): Measure | null {
  if (item.measurementUnit === "kg") {
    return { dimension: "weight", amount: (item.unitMultiplier ?? 1) * 1000 };
  }
  const value = (name: string) => properties.find((property) => property.name === name)?.values[0];
  const unit = UNITS[value("Gramaje de unidad de medida") ?? ""];
  const amount = Number(value("Gramaje de unidad de consumo"));
  if (!unit || !Number.isFinite(amount) || amount <= 0) return null;
  const [named, ...others] = sizesIn(productName);
  if (named && others.length === 0 && named.dimension !== unit.dimension) {
    return { dimension: named.dimension, amount: named.amount };
  }
  return { dimension: unit.dimension, amount: amount * unit.factor };
}

const fetchJson: HttpClient = async (request) => {
  const { method, url, body } = request;
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(request, response.status, parseOrText(text));
  }
  return response.json();
};

function parseOrText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
