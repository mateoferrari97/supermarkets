import { z } from "zod";
import type { CatalogProduct } from "../order-matching/catalog-product.ts";
import { money } from "../product-selection/cart.ts";

const catalogProductSchema: z.ZodType<CatalogProduct> = z.object({
  productId: z.string(),
  itemId: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  department: z.string(),
  tipo: z.string().nullable(),
  price: z.number().nullable(),
  inStock: z.boolean(),
  sale: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("by-weight"), saleStepKg: z.number() }),
    z.object({
      kind: z.literal("packaged"),
      size: z
        .object({
          dimension: z.enum(["volume", "weight", "units", "length"]),
          amount: z.number(),
        })
        .nullable(),
    }),
  ]),
  teasers: z.array(z.object({ name: z.string(), minimumQuantity: z.number() })),
});

export const orderLineSchema = z.object({
  description: z.string(),
  productId: z.string(),
  itemId: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  quantity: z.number().positive(),
  unitPrice: z.number(),
  total: z.number(),
  reason: z.string(),
  notes: z.array(z.string()),
});

export type OrderLine = z.infer<typeof orderLineSchema>;

export const resolvedItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("picked"), ref: z.string(), line: orderLineSchema }),
  z.object({
    kind: z.literal("none"),
    ref: z.string(),
    description: z.string(),
    note: z.string(),
  }),
  z.object({
    kind: z.literal("choose"),
    ref: z.string(),
    description: z.string(),
    brand: z.string().nullable(),
    size: z.string(),
    quantity: z.string(),
    alternatives: z.array(catalogProductSchema).min(1),
    shown: z.array(z.string()),
  }),
]);

export type ResolvedItem = z.infer<typeof resolvedItemSchema>;

export const proposalSchema = z.object({
  id: z.string(),
  lines: z.array(orderLineSchema).min(1),
  notes: z.array(z.string()),
  total: z.number(),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const cartSchema = z.object({
  postalCode: z.string(),
  lines: z.array(orderLineSchema).min(1),
  notes: z.array(z.string()),
  total: z.number(),
  warning: z.string(),
  cartLink: z.string(),
});

export type Cart = z.infer<typeof cartSchema>;

export const chatOrderSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "proposed", "closed"]),
  openedAt: z.iso.datetime(),
  items: z.array(resolvedItemSchema),
  proposals: z.number().int().nonnegative(),
  proposal: proposalSchema.nullable(),
  cart: cartSchema.optional(),
  reopened: z.boolean().optional(),
});

export type ChatOrder = z.infer<typeof chatOrderSchema>;

export const ordersSchema = z.array(chatOrderSchema);

export const openOrderOf = (orders: ChatOrder[]): ChatOrder | null =>
  orders.find((order) => order.status !== "closed") ?? null;

export function openOrder(orders: ChatOrder[], now: Date): ChatOrder {
  const open = openOrderOf(orders);
  if (open) return open;
  const order: ChatOrder = {
    id: `order-${String(orders.length + 1)}`,
    status: "draft",
    openedAt: now.toISOString(),
    items: [],
    proposals: 0,
    proposal: null,
  };
  orders.push(order);
  return order;
}

export function proposalOf(
  order: ChatOrder,
  refs: string[],
):
  | { kind: "proposal"; proposal: Proposal }
  | {
      kind: "refused";
      reason: "unknown-ref" | "needs-choice" | "nothing-to-buy";
      ref: string | null;
    } {
  const wanted = [...new Set(refs)];
  const chosen: ResolvedItem[] = [];
  for (const ref of wanted) {
    const found = order.items.find((item) => item.ref === ref);
    if (!found) return { kind: "refused", reason: "unknown-ref", ref };
    if (found.kind === "choose") return { kind: "refused", reason: "needs-choice", ref };
    chosen.push(found);
  }
  const lines = chosen.flatMap((item) => (item.kind === "picked" ? [item.line] : []));
  if (lines.length === 0) return { kind: "refused", reason: "nothing-to-buy", ref: null };
  const left = order.items.flatMap((item) =>
    item.kind === "choose" && !wanted.includes(item.ref)
      ? [`No elegiste una opción para "${item.description}", así que la dejé afuera.`]
      : [],
  );
  const notes = [...chosen.flatMap((item) => (item.kind === "none" ? [item.note] : [])), ...left];
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  return {
    kind: "proposal",
    proposal: { id: `${order.id}-${String(order.proposals + 1)}`, lines, notes, total },
  };
}

export function renderProposal({ lines, notes, total }: Proposal): string {
  return [
    "Armé este pedido:",
    ...lines.map(
      (line, index) =>
        `${String(index + 1)}. ${line.name} × ${String(line.quantity)}: ${money(line.total)}`,
    ),
    `Total: ${money(total)}`,
    ...notes,
    "Decime si está bien así.",
  ].join("\n");
}

export function renderCart({ lines, notes, total, warning, cartLink }: Cart): string {
  return [
    "Listo, este es tu carrito en Carrefour:",
    ...lines.map(
      (line, index) =>
        `${String(index + 1)}. ${line.name} × ${String(line.quantity)}: ${money(line.total)}`,
    ),
    `Total: ${money(total)}`,
    ...notes,
    warning,
    cartLink,
  ].join("\n");
}

export function renderOrder(order: ChatOrder | null): string {
  if (order === null) return "<order>\nThere is no open Order.\n</order>";
  const items = order.items.map((item) => {
    if (item.kind === "picked") {
      return `- ref ${item.ref}: "${item.line.description}" is product ${item.line.productId} "${item.line.name}", quantity ${String(item.line.quantity)}, ${money(item.line.total)}`;
    }
    if (item.kind === "none") return `- ref ${item.ref}: "${item.description}" was not found`;
    const options = item.alternatives
      .map((product) => `${product.productId} "${product.name}" ${money(product.price ?? 0)}`)
      .join("; ");
    return `- ref ${item.ref}: "${item.description}" has no product that fits; the Owner has to choose among: ${options}; shown so far: ${item.shown.join(", ")}`;
  });
  const proposal =
    order.proposal === null
      ? "proposal: none yet"
      : `proposal ${order.proposal.id}: ${order.proposal.lines.map((line) => line.productId).join(", ")}${order.status === "proposed" ? " (waiting for the Owner's answer)" : " (out of date: an Item changed after it)"}`;
  return [
    "<order>",
    `id: ${order.id}`,
    `status: ${order.status}`,
    ...(order.reopened === true
      ? ["reopened: true (a Correction of an Order whose link was already given)"]
      : []),
    "items:",
    ...(items.length > 0 ? items : ["- none yet"]),
    proposal,
    "</order>",
  ].join("\n");
}
