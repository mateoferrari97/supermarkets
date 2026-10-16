import { z } from "zod";
import type { OnlineStore, SimulatedLine } from "../product-selection/online-store.ts";
import {
  boughtLines,
  lastClosedOrders,
  openOrder,
  openOrderOf,
  type OrderLine,
  type ResolvedItem,
} from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";
import { pickedOutput, type ResolveItemOutput } from "./resolve-item.ts";

export const repeatOrderInput = z.object({
  orderId: z.string().describe("The id of the past Order to repeat, as shown in <past-orders>."),
});

export type RepeatOrderOutput =
  | { kind: "repeated"; items: ResolveItemOutput[] }
  | {
      kind: "refused";
      reason: "no-postal-code" | "order-open" | "unknown-order" | "nothing-to-repeat";
    };

export type RepeatOrderDependencies = {
  store: OnlineStore;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  now: () => Date;
};

export async function repeatOrder(
  input: z.infer<typeof repeatOrderInput>,
  { store, orders, loadProfile, now }: RepeatOrderDependencies,
  signal: AbortSignal,
): Promise<RepeatOrderOutput> {
  const profile = loadProfile();
  if (profile === null) return { kind: "refused", reason: "no-postal-code" };
  const all = orders.load();
  if (openOrderOf(all) !== null) return { kind: "refused", reason: "order-open" };
  const past = lastClosedOrders(all).find((order) => order.id === input.orderId);
  if (past === undefined) return { kind: "refused", reason: "unknown-order" };
  const wanted = boughtLines(past);
  if (wanted.length === 0) return { kind: "refused", reason: "nothing-to-repeat" };

  const simulate = (lines: OrderLine[]) =>
    store.simulate(
      {
        postalCode: profile.postalCode,
        items: lines.map(({ itemId, quantity }) => ({ itemId, quantity })),
      },
      signal,
    );
  const simulatedOf = (simulated: SimulatedLine[], line: OrderLine) =>
    simulated.find((each) => each.itemId === line.itemId);
  const whole = await simulate(wanted);
  const available = wanted.filter((line) => simulatedOf(whole.lines, line)?.available);
  const final =
    available.length === wanted.length || available.length === 0
      ? whole
      : await simulate(available);

  const order = openOrder(all, now());
  const repeated = wanted.map((line, index): [ResolvedItem, ResolveItemOutput] => {
    const ref = String(index + 1);
    const simulated = available.includes(line) ? simulatedOf(final.lines, line) : undefined;
    if (simulated === undefined) {
      const note = `"${line.name}" ya no está disponible.`;
      return [
        { kind: "none", ref, description: line.description, note },
        { kind: "none", ref, note },
      ];
    }
    const repeatedLine: OrderLine = {
      ...line,
      unitPrice: simulated.total / line.quantity,
      total: simulated.total,
      reason: `Repetido del pedido ${past.id}`,
      notes: [],
    };
    return [{ kind: "picked", ref, line: repeatedLine }, pickedOutput(ref, repeatedLine)];
  });
  order.items.push(...repeated.map(([item]) => item));
  orders.save(all);
  return { kind: "repeated", items: repeated.map(([, output]) => output) };
}
