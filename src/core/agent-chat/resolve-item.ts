import { z } from "zod";
import { stepsFrom } from "../order-conversation/steps.ts";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import { MATCHES_LIMIT, type CatalogSearch } from "../order-matching/catalog-search.ts";
import { parseLine, type Item } from "../order-matching/item.ts";
import { matchItems, type FitProductsLlm } from "../order-matching/match-items.ts";
import { simulateCart } from "../product-selection/cart.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { candidatesFor } from "../product-selection/selection.ts";
import { openOrder, openOrderOf, type OrderLine, type ResolvedItem } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";

export const ALTERNATIVES_PER_ROUND = 3;

export const resolveItemInput = z.object({
  description: z
    .string()
    .describe('The product the Owner asked for, in their words, such as "leche" or "coca cola".'),
  brand: z.string().optional().describe("The brand the Owner named, if any."),
  size: z
    .string()
    .optional()
    .describe(
      'The size the Owner asked for: "common" (default), "biggest", "smallest" or an amount such as "1.5 l", "500 ml", "400 g" or "1 kg".',
    ),
  quantity: z
    .string()
    .optional()
    .describe(
      'How much the Owner wants: "minimum" (default, the least that makes sense), a count such as "3 unit" or a weight such as "500 g" or "1.5 kg".',
    ),
  excludeProductIds: z
    .array(z.string())
    .optional()
    .describe(
      'The productIds of the options already shown for this Item. Pass them when the Owner asks for "más opciones", so the next options are different.',
    ),
});

export type AlternativeOutput = {
  productId: string;
  name: string;
  brand: string | null;
  price: number | null;
};

export type ResolveItemOutput =
  | {
      kind: "picked";
      ref: string;
      product: { productId: string; name: string; brand: string | null };
      quantity: number;
      unitPrice: number;
      total: number;
      reason: string;
      notes: string[];
    }
  | { kind: "choose"; ref: string; alternatives: AlternativeOutput[] }
  | { kind: "none"; ref: string; note: string }
  | { kind: "refused"; reason: "no-postal-code" | "invalid-size-or-quantity"; detail: string };

export const alternativeOutput = ({
  productId,
  name,
  brand,
  price,
}: CatalogProduct): AlternativeOutput => ({ productId, name, brand, price });

export function pickedOutput(ref: string, line: OrderLine): ResolveItemOutput {
  return {
    kind: "picked",
    ref,
    product: { productId: line.productId, name: line.name, brand: line.brand },
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    total: line.total,
    reason: line.reason,
    notes: line.notes,
  };
}

export async function buyFits(
  item: Item,
  description: string,
  fits: CatalogProduct[],
  note: string | null,
  postalCode: string,
  store: OnlineStore,
  signal: AbortSignal,
): Promise<{ line: OrderLine } | { note: string | null }> {
  const { bought } = await simulateCart(
    [{ kind: "choose", original: item.original, note, candidates: candidatesFor(item, fits) }],
    postalCode,
    store,
    signal,
  );
  const [result] = bought;
  if (result?.kind !== "bought") return { note: result?.note ?? null };
  const { line } = result;
  return {
    line: {
      description,
      productId: line.product.productId,
      itemId: line.product.itemId,
      name: line.product.name,
      brand: line.product.brand,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.total,
      reason: line.reason,
      notes: line.notes,
    },
  };
}

function textOr<Fallback>(text: string | undefined, fallback: Fallback): string | Fallback {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? fallback : trimmed;
}

type Choose = Extract<ResolvedItem, { kind: "choose" }>;

type Outcome =
  | { kind: "picked"; line: OrderLine }
  | { kind: "none"; description: string; note: string }
  | { kind: "choose"; alternatives: CatalogProduct[] };

export type ResolveItemDependencies = {
  search: CatalogSearch;
  llm: FitProductsLlm;
  store: OnlineStore;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  now: () => Date;
};

function withoutExcluded(search: CatalogSearch, excluded: Set<string>): CatalogSearch {
  if (excluded.size === 0) return search;
  return {
    findMatches: (item, scope, limit = MATCHES_LIMIT) =>
      search
        .findMatches(item, scope, limit + excluded.size)
        .filter((product) => !excluded.has(product.productId))
        .slice(0, limit),
  };
}

export async function resolveItem(
  input: z.infer<typeof resolveItemInput>,
  { search, llm, store, orders, loadProfile, now }: ResolveItemDependencies,
  signal: AbortSignal,
): Promise<ResolveItemOutput> {
  const profile = loadProfile();
  if (profile === null) {
    return { kind: "refused", reason: "no-postal-code", detail: "The Profile has no postal code." };
  }
  const description = input.description.trim();
  const brand = textOr(input.brand, null);
  const size = textOr(input.size, "common");
  const quantity = textOr(input.quantity, "minimum");
  const original =
    brand === null || description.toLowerCase().includes(brand.toLowerCase())
      ? description
      : `${description} ${brand}`;
  const parsed = parseLine({ original, product: description, brand, size, quantity });
  if (!parsed.ok) {
    return { kind: "refused", reason: "invalid-size-or-quantity", detail: parsed.failure };
  }
  const { item } = parsed;
  const asked = input.excludeProductIds ?? [];
  const earlier =
    asked.length === 0
      ? undefined
      : openOrderOf(orders.load())
          ?.items.filter((each): each is Choose => each.kind === "choose")
          .findLast((each) => each.description === description);
  const excluded = new Set([...asked, ...(earlier?.shown ?? [])]);
  const [match] = await matchItems(
    [item],
    { search: withoutExcluded(search, excluded), llm },
    stepsFrom({ signal }),
  );
  const notFound = `No encontré "${description}".`;
  let outcome: Outcome;
  if (match!.fits.length === 0) {
    const pool = [...(match!.question?.alternatives ?? []), ...match!.matches];
    const alternatives = [...new Map(pool.map((product) => [product.productId, product])).values()]
      .filter((product) => !excluded.has(product.productId))
      .slice(0, ALTERNATIVES_PER_ROUND);
    outcome =
      alternatives.length === 0
        ? { kind: "none", description, note: notFound }
        : { kind: "choose", alternatives };
  } else {
    const bought = await buyFits(
      item,
      description,
      match!.fits,
      match!.note,
      profile.postalCode,
      store,
      signal,
    );
    outcome =
      "line" in bought
        ? { kind: "picked", line: bought.line }
        : { kind: "none", description, note: bought.note ?? notFound };
  }
  const all = orders.load();
  const order = openOrder(all, now());
  const index = earlier ? order.items.findIndex((each) => each.ref === earlier.ref) : -1;
  const ref = earlier && index >= 0 ? earlier.ref : String(order.items.length + 1);
  const resolved: ResolvedItem =
    outcome.kind === "choose"
      ? {
          kind: "choose",
          ref,
          description,
          brand,
          size,
          quantity,
          alternatives: outcome.alternatives,
          shown: [
            ...new Set([...excluded, ...outcome.alternatives.map((product) => product.productId)]),
          ],
        }
      : { ...outcome, ref };
  if (index >= 0) order.items[index] = resolved;
  else order.items.push(resolved);
  if (order.status === "proposed") order.status = "draft";
  orders.save(all);
  if (outcome.kind === "none") return { kind: "none", ref, note: outcome.note };
  if (outcome.kind === "choose") {
    return { kind: "choose", ref, alternatives: outcome.alternatives.map(alternativeOutput) };
  }
  return pickedOutput(ref, outcome.line);
}
