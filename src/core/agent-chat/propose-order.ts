import { z } from "zod";
import { openOrderOf, proposalOf, renderProposal } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { TurnOutcome } from "./tool.ts";

export const proposeOrderInput = z.object({
  refs: z
    .array(z.string())
    .min(1)
    .describe(
      "The ref of every resolveItem result the Order should include, found or not found, in the order to show.",
    ),
});

export type ProposeOrderOutput =
  | { kind: "proposed"; proposalId: string }
  | {
      kind: "refused";
      reason: "no-open-order" | "unknown-ref" | "needs-choice" | "nothing-to-buy";
      ref: string | null;
    };

export type ProposeOrderDependencies = { orders: OrdersStore; outcome: TurnOutcome };

export function proposeOrder(
  input: z.infer<typeof proposeOrderInput>,
  { orders, outcome }: ProposeOrderDependencies,
): Promise<ProposeOrderOutput> {
  const all = orders.load();
  const order = openOrderOf(all);
  if (order === null) {
    return Promise.resolve({ kind: "refused", reason: "no-open-order", ref: null });
  }
  const made = proposalOf(order, input.refs);
  if (made.kind === "refused") {
    return Promise.resolve({ kind: "refused", reason: made.reason, ref: made.ref });
  }
  const { proposal } = made;
  order.proposals += 1;
  order.proposal = proposal;
  order.status = "proposed";
  orders.save(all);
  if (order.reopened !== true) {
    outcome.ended = {
      text: renderProposal(proposal),
      parts: [{ type: "proposal", proposal }],
    };
  }
  return Promise.resolve({ kind: "proposed", proposalId: proposal.id });
}
