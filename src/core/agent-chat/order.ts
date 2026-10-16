import { z } from "zod";
import { money } from "../product-selection/cart.ts";

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
]);

export type ResolvedItem = z.infer<typeof resolvedItemSchema>;

export const proposalSchema = z.object({
  id: z.string(),
  lines: z.array(orderLineSchema).min(1),
  notes: z.array(z.string()),
  total: z.number(),
});

export type Proposal = z.infer<typeof proposalSchema>;

export const chatOrderSchema = z.object({
  id: z.string(),
  status: z.enum(["draft", "proposed", "closed"]),
  openedAt: z.iso.datetime(),
  items: z.array(resolvedItemSchema),
  proposals: z.number().int().nonnegative(),
  proposal: proposalSchema.nullable(),
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
  | { kind: "refused"; reason: "unknown-ref" | "nothing-to-buy"; ref: string | null } {
  const wanted = [...new Set(refs)];
  const chosen: ResolvedItem[] = [];
  for (const ref of wanted) {
    const found = order.items.find((item) => item.ref === ref);
    if (!found) return { kind: "refused", reason: "unknown-ref", ref };
    chosen.push(found);
  }
  const lines = chosen.flatMap((item) => (item.kind === "picked" ? [item.line] : []));
  if (lines.length === 0) return { kind: "refused", reason: "nothing-to-buy", ref: null };
  const notes = chosen.flatMap((item) => (item.kind === "none" ? [item.note] : []));
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

export function renderOrder(order: ChatOrder | null): string {
  if (order === null) return "<order>\nThere is no open Order.\n</order>";
  const items = order.items.map((item) =>
    item.kind === "picked"
      ? `- ref ${item.ref}: "${item.line.description}" is product ${item.line.productId} "${item.line.name}", quantity ${String(item.line.quantity)}, ${money(item.line.total)}`
      : `- ref ${item.ref}: "${item.description}" was not found`,
  );
  const proposal =
    order.proposal === null
      ? "proposal: none yet"
      : `proposal ${order.proposal.id}: ${order.proposal.lines.map((line) => line.productId).join(", ")}`;
  return [
    "<order>",
    `id: ${order.id}`,
    `status: ${order.status}`,
    "items:",
    ...(items.length > 0 ? items : ["- none yet"]),
    proposal,
    "</order>",
  ].join("\n");
}
