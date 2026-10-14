import { z } from "zod";
import { normalize } from "../order-resolution/text.ts";
import type { PaymentCard } from "./store.ts";

export const paymentCardTableSchema = z.strictObject({
  cards: z.array(
    z.strictObject({
      names: z.array(z.string().min(1)).min(1),
      paymentSystem: z.string().regex(/^\d+$/),
      bin: z
        .string()
        .regex(/^\d{6}$/)
        .nullable(),
    }),
  ),
});

export type PaymentCardTable = z.infer<typeof paymentCardTableSchema>;

export function validatePaymentCards(input: unknown): string[] {
  const parsed = paymentCardTableSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `payment cards ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const seen = new Set<string>();
  const errors: string[] = [];
  for (const name of parsed.data.cards.flatMap(({ names }) => names)) {
    const key = normalize(name);
    if (seen.has(key)) errors.push(`payment card name "${name}" is used more than once`);
    seen.add(key);
  }
  return errors;
}

export function findPaymentCard(table: PaymentCardTable, name: string): PaymentCard | null {
  const wanted = normalize(name);
  const card = table.cards.find(({ names }) => names.some((known) => normalize(known) === wanted));
  return card ? { paymentSystem: card.paymentSystem, bin: card.bin } : null;
}
