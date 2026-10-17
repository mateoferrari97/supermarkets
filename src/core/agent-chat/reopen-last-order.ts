import { z } from "zod";
import type { OrdersStore } from "./orders-store.ts";
import { openOrderOf } from "./order.ts";

export const reopenLastOrderInput = z.object({});

export type ReopenLastOrderOutput =
  | { kind: "reopened"; orderId: string }
  | { kind: "refused"; reason: "no-closed-order" | "order-open" };

export type ReopenLastOrderDependencies = { orders: OrdersStore };

export function reopenLastOrder({
  orders,
}: ReopenLastOrderDependencies): Promise<ReopenLastOrderOutput> {
  const all = orders.load();
  if (openOrderOf(all) !== null) return Promise.resolve({ kind: "refused", reason: "order-open" });
  const last = all.at(-1);
  if (last === undefined) return Promise.resolve({ kind: "refused", reason: "no-closed-order" });
  last.status = "proposed";
  last.reopened = true;
  orders.save(all);
  return Promise.resolve({ kind: "reopened", orderId: last.id });
}
