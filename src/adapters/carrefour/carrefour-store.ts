import { z } from "zod";
import type {
  Delivery,
  OnlineStore,
  Simulation,
  SimulationItem,
  SimulationRequest,
} from "../../core/product-selection/online-store.ts";

export const CARREFOUR_URL = "https://www.carrefour.com.ar";

export type HttpRequest = {
  method: "GET" | "POST";
  url: string;
  body?: unknown;
  signal?: AbortSignal;
};
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

export function createCarrefourStore(http: HttpClient = fetchJson): OnlineStore {
  const regions = new Map<string, Promise<Region | null>>();

  const regionFor = (postalCode: string, signal: AbortSignal) => {
    const known = regions.get(postalCode);
    if (known) return known;
    const url = `${CARREFOUR_URL}/api/checkout/pub/regions?${new URLSearchParams({ country: "ARG", postalCode })}`;
    const region = http({ method: "GET", url, signal }).then(
      (body) => regionsSchema.parse(body)[0] ?? null,
    );
    regions.set(postalCode, region);
    region.catch(() => regions.delete(postalCode));
    return region;
  };

  const checkDelivery = async (postalCode: string, signal: AbortSignal): Promise<Delivery> => {
    try {
      const region = await regionFor(postalCode, signal);
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

  const simulate = async (
    { postalCode, items }: SimulationRequest,
    signal: AbortSignal,
  ): Promise<Simulation> => {
    const url = `${CARREFOUR_URL}/api/checkout/pub/orderForms/simulation?sc=1&RnbBehavior=0`;
    const body = simulationSchema.parse(
      await http({
        method: "POST",
        url,
        body: {
          items: items.map(({ itemId, quantity }) => ({ id: itemId, quantity, seller: "1" })),
          country: "ARG",
          postalCode,
        },
        signal,
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

  return { checkDelivery, simulate, cartLink };
}

function cartLink(items: SimulationItem[]): string {
  const params = new URLSearchParams();
  const inTextOrder = [...items].sort((a, b) => (a.itemId < b.itemId ? -1 : 1));
  inTextOrder.forEach(({ itemId, quantity }, index) => {
    const zeros = "0".repeat(inTextOrder.length - 1 - index);
    params.append("sku", itemId);
    params.append("qty", `${zeros}${quantity}`);
    params.append("seller", "1");
  });
  params.append("sc", "1");
  return `${CARREFOUR_URL}/checkout/cart/add?${params}`;
}

const fetchJson: HttpClient = async (request) => {
  const { method, url, body, signal } = request;
  const response = await fetch(url, {
    method,
    signal,
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
