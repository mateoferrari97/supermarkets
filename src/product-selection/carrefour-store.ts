import { z } from "zod";
import { normalize } from "../order-resolution/text.ts";
import type {
  CandidateQuery,
  Measure,
  OnlineStore,
  PaymentCard,
  Simulation,
  SimulationRequest,
  SnapshotProduct,
  StoreProduct,
} from "./store.ts";

export const CARREFOUR_URL = "https://www.carrefour.com.ar";

export type HttpRequest = { method: "GET" | "POST"; url: string; body?: unknown };
export type HttpClient = (request: HttpRequest) => Promise<unknown>;

const regionsSchema = z.array(z.object({ id: z.string() }));

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
  const regions = new Map<string, Promise<string | null>>();
  const tipoSlugs = new Map<string, Promise<string | null>>();

  const search = (path: string, params: Record<string, string>) =>
    `${CARREFOUR_URL}/api/intelligent-search/v1/${path}?${new URLSearchParams({ sc: "1", ...params })}`;

  const regionFor = (postalCode: string) => {
    const known = regions.get(postalCode);
    if (known) return known;
    const url = `${CARREFOUR_URL}/api/checkout/pub/regions?${new URLSearchParams({ country: "ARG", postalCode })}`;
    const region = http({ method: "GET", url }).then(
      (body) => regionsSchema.parse(body)[0]?.id ?? null,
    );
    regions.set(postalCode, region);
    return region;
  };

  const facetValue = async (
    path: string,
    params: Record<string, string>,
    key: string,
    name: string,
  ) => {
    const body = facetsSchema.parse(await http({ method: "GET", url: search(path, params) }));
    const wanted = normalize(name);
    const facet = body.facets.find((candidate) => candidate.key === key);
    return facet?.values.find((value) => normalize(value.name ?? "") === wanted)?.value ?? null;
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
    const [regionId, ...slugs] = await Promise.all([
      regionFor(postalCode),
      ...tipos.map(slugForTipo),
    ]);
    const tipoPath = slugs
      .filter((slug): slug is string => slug !== null)
      .map((slug) => `tipo-de-producto/${slug}`)
      .join("/");
    if (!tipoPath) return [];
    const region: Record<string, string> = regionId ? { regionId } : {};
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
          measure: measureOf(product.properties, item),
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

  return { findCandidates, simulate };
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
        measure: measureOf(properties, {}),
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
  return { dimension: unit.dimension, amount: amount * unit.factor };
}

const fetchJson: HttpClient = async ({ method, url, body }) => {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(
      `Carrefour ${method} ${url} answered ${response.status}: ${await response.text()}`,
    );
  }
  return response.json();
};
