import { z } from "zod";
import { stepsFrom } from "../order-conversation/steps.ts";
import type { CatalogSearch } from "../order-matching/catalog-search.ts";
import { parseLine } from "../order-matching/item.ts";
import { matchItems, type FitProductsLlm } from "../order-matching/match-items.ts";
import { simulateCart } from "../product-selection/cart.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { candidatesFor } from "../product-selection/selection.ts";
import { openOrder, type OrderLine } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";

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
});

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
  | { kind: "none"; ref: string; note: string }
  | { kind: "refused"; reason: "no-postal-code" | "invalid-size-or-quantity"; detail: string };

function textOr<Fallback>(text: string | undefined, fallback: Fallback): string | Fallback {
  const trimmed = text?.trim();
  return trimmed === undefined || trimmed === "" ? fallback : trimmed;
}

type Outcome =
  { kind: "picked"; line: OrderLine } | { kind: "none"; description: string; note: string };

export type ResolveItemDependencies = {
  search: CatalogSearch;
  llm: FitProductsLlm;
  store: OnlineStore;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  now: () => Date;
};

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
  const parsed = parseLine({
    original: description,
    product: description,
    brand: textOr(input.brand, null),
    size: textOr(input.size, "common"),
    quantity: textOr(input.quantity, "minimum"),
  });
  if (!parsed.ok) {
    return { kind: "refused", reason: "invalid-size-or-quantity", detail: parsed.failure };
  }
  const { item } = parsed;
  const [match] = await matchItems([item], { search, llm }, stepsFrom({ signal }));
  const fits = match!.fits;
  const notFound = `No encontré "${description}".`;
  let outcome: Outcome;
  if (fits.length === 0) {
    outcome = { kind: "none", description, note: notFound };
  } else {
    const { bought } = await simulateCart(
      [
        {
          kind: "choose",
          original: item.original,
          note: match!.note,
          candidates: candidatesFor(item, fits),
        },
      ],
      profile.postalCode,
      store,
      signal,
    );
    const [result] = bought;
    if (result?.kind === "bought") {
      const { line } = result;
      const orderLine: OrderLine = {
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
      };
      outcome = { kind: "picked", line: orderLine };
    } else {
      outcome = { kind: "none", description, note: result?.note ?? notFound };
    }
  }
  const all = orders.load();
  const order = openOrder(all, now());
  const ref = String(order.items.length + 1);
  order.items.push({ ...outcome, ref });
  if (order.status === "proposed") order.status = "draft";
  orders.save(all);
  if (outcome.kind === "none") return { kind: "none", ref, note: outcome.note };
  const { line } = outcome;
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
