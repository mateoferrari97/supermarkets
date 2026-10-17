import { z } from "zod";
import type { ChatMessage } from "./chat.ts";
import { parseLine } from "../order-matching/item.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";
import { openOrderOf } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import type { Profile } from "./profile.ts";
import { buyFits, pickedOutput, type ResolveItemOutput } from "./resolve-item.ts";

export const chooseAlternativeInput = z.object({
  ref: z.string().describe("The ref of the resolveItem result that answered choose."),
  productId: z
    .string()
    .optional()
    .describe("The productId of the option the Owner chose, one of those resolveItem returned."),
  recommended: z
    .boolean()
    .optional()
    .describe(
      "True to take the option that was recommended for this ref in the last round, when the Owner accepts the recommended answers. Pass it instead of productId.",
    ),
});

export type ChooseAlternativeOutput =
  | Extract<ResolveItemOutput, { kind: "picked" }>
  | { kind: "unavailable"; ref: string; note: string }
  | {
      kind: "refused";
      reason:
        | "no-postal-code"
        | "no-open-order"
        | "unknown-ref"
        | "not-an-alternative"
        | "no-recommended-product";
    };

export type ChooseAlternativeDependencies = {
  store: OnlineStore;
  orders: OrdersStore;
  loadProfile: () => Profile | null;
  messages: ChatMessage[];
};

function recommendedProductId(messages: ChatMessage[], ref: string): string | null {
  for (const message of messages.toReversed()) {
    for (const part of message.parts ?? []) {
      if (part.type !== "round") continue;
      const question = part.round.questions.find((each) => each.ref === ref);
      if (question) return question.options[question.recommended - 1]?.productId ?? null;
    }
  }
  return null;
}

export async function chooseAlternative(
  input: z.infer<typeof chooseAlternativeInput>,
  { store, orders, loadProfile, messages }: ChooseAlternativeDependencies,
  signal: AbortSignal,
): Promise<ChooseAlternativeOutput> {
  const { ref } = input;
  const profile = loadProfile();
  if (profile === null) return { kind: "refused", reason: "no-postal-code" };
  const order = openOrderOf(orders.load());
  if (order === null) return { kind: "refused", reason: "no-open-order" };
  const entry = order.items.find((item) => item.ref === ref);
  if (entry?.kind !== "choose") return { kind: "refused", reason: "unknown-ref" };
  const productId = input.recommended ? recommendedProductId(messages, ref) : input.productId;
  if (productId === null) return { kind: "refused", reason: "no-recommended-product" };
  const chosen = entry.alternatives.find((product) => product.productId === productId);
  if (chosen === undefined) return { kind: "refused", reason: "not-an-alternative" };
  const parsed = parseLine({
    original: entry.description,
    product: entry.description,
    brand: entry.brand,
    size: entry.size,
    quantity: entry.quantity,
  });
  if (!parsed.ok) return { kind: "refused", reason: "unknown-ref" };
  const bought = await buyFits(
    parsed.item,
    entry.description,
    [chosen],
    null,
    profile.postalCode,
    store,
    signal,
  );
  if (!("line" in bought)) {
    return {
      kind: "unavailable",
      ref,
      note: bought.note ?? `No conseguí "${chosen.name}" ahora.`,
    };
  }
  const all = orders.load();
  const current = openOrderOf(all);
  const index = current?.items.findIndex((item) => item.ref === ref) ?? -1;
  if (current === null || index < 0) return { kind: "refused", reason: "unknown-ref" };
  current.items[index] = { kind: "picked", ref, line: bought.line };
  if (current.status === "proposed") current.status = "draft";
  orders.save(all);
  return pickedOutput(ref, bought.line) as Extract<ResolveItemOutput, { kind: "picked" }>;
}
