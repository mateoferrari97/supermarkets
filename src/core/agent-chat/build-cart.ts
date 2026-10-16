import { z } from "zod";
import { CART_WARNING } from "../product-selection/cart.ts";
import type { OnlineStore, SimulatedLine } from "../product-selection/online-store.ts";
import type { ChatMessage } from "./chat.ts";
import { openOrderOf, renderCart, type Cart, type OrderLine } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";
import type { TurnOutcome } from "./tool.ts";

export const buildCartInput = z.object({
  proposalId: z.string().describe("The id of the latest proposal, as shown in the <order> block."),
});

export type BuildCartOutput =
  | { kind: "built"; cartLink: string; total: number }
  | {
      kind: "refused";
      reason:
        | "no-postal-code"
        | "no-open-order"
        | "no-proposal"
        | "stale-proposal"
        | "unanswered"
        | "nothing-available";
    };

export type BuildCartDependencies = {
  store: OnlineStore;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  outcome: TurnOutcome;
  messages: ChatMessage[];
};

const hasProposal = (message: ChatMessage, proposalId: string): boolean =>
  message.role === "assistant" &&
  (message.parts ?? []).some((part) => part.type === "proposal" && part.proposal.id === proposalId);

function isAnswered(messages: ChatMessage[], proposalId: string): boolean {
  const shown = messages.findLastIndex((message) => hasProposal(message, proposalId));
  return shown >= 0 && messages.slice(shown + 1).some((message) => message.role === "owner");
}

export async function buildCart(
  input: z.infer<typeof buildCartInput>,
  { store, orders, loadProfile, outcome, messages }: BuildCartDependencies,
  signal: AbortSignal,
): Promise<BuildCartOutput> {
  const profile = loadProfile();
  if (profile === null) return { kind: "refused", reason: "no-postal-code" };
  const all = orders.load();
  const order = openOrderOf(all);
  if (order === null) return { kind: "refused", reason: "no-open-order" };
  const { proposal } = order;
  if (proposal === null) return { kind: "refused", reason: "no-proposal" };
  if (proposal.id !== input.proposalId || order.status !== "proposed") {
    return { kind: "refused", reason: "stale-proposal" };
  }
  if (order.reopened !== true && !isAnswered(messages, proposal.id))
    return { kind: "refused", reason: "unanswered" };

  const simulate = (lines: OrderLine[]) =>
    store.simulate(
      {
        postalCode: profile.postalCode,
        items: lines.map(({ itemId, quantity }) => ({ itemId, quantity })),
      },
      signal,
    );
  const whole = await simulate(proposal.lines);
  const simulatedOf = (simulated: SimulatedLine[], line: OrderLine) =>
    simulated.find((each) => each.itemId === line.itemId);
  const available = proposal.lines.filter((line) => simulatedOf(whole.lines, line)?.available);
  if (available.length === 0) return { kind: "refused", reason: "nothing-available" };
  const final = available.length === proposal.lines.length ? whole : await simulate(available);
  const lines = available.map((line): OrderLine => {
    const simulated = simulatedOf(final.lines, line)!;
    return { ...line, unitPrice: simulated.total / line.quantity, total: simulated.total };
  });
  const dropped = proposal.lines
    .filter((line) => !available.includes(line))
    .map((line) => `"${line.name}" no estaba disponible al armar el carrito`);
  const cart: Cart = {
    postalCode: profile.postalCode,
    lines,
    notes: [...proposal.notes, ...dropped],
    total: final.total,
    warning: CART_WARNING,
    cartLink: store.cartLink(lines.map(({ itemId, quantity }) => ({ itemId, quantity }))),
  };
  order.status = "closed";
  order.cart = cart;
  delete order.reopened;
  orders.save(all);
  outcome.ended = { text: renderCart(cart), parts: [{ type: "cart", cart }] };
  return { kind: "built", cartLink: cart.cartLink, total: cart.total };
}
