import { z } from "zod";
import type { SelectionPolicy } from "../../core/order-resolution/concepts.ts";
import type {
  MapAnswerOutput,
  ResolveItemOutput,
  RewordItemOutput,
  SplitOrderOutput,
} from "../../core/order-resolution/llm.ts";

export const splitOrderOutputSchema: z.ZodType<SplitOrderOutput> = z.strictObject({
  items: z.array(
    z.strictObject({
      phrase: z.string().min(1),
      quantity: z.number().positive().nullable(),
      brand: z.string().min(1).nullable(),
      terms: z.array(z.string().min(1)),
      vagueWords: z.array(z.string().min(1)),
    }),
  ),
  paymentCard: z.string().min(1).nullable(),
  preference: z.string().min(1).nullable(),
});

export const resolveItemOutputSchema: z.ZodType<ResolveItemOutput> = z.strictObject({
  kind: z.enum(["match", "ambiguous", "none"]),
  candidates: z.array(z.string()),
});

export const mapAnswerOutputSchema: z.ZodType<MapAnswerOutput> = z.strictObject({
  answers: z.array(
    z.strictObject({
      question: z.number().int().positive(),
      kind: z.enum(["chosen", "any", "rephrased", "unclear"]),
      options: z.array(z.number().int().positive()),
      phrase: z.string().min(1).nullable(),
    }),
  ),
});

export const rewordItemOutputSchema: z.ZodType<RewordItemOutput> = z.strictObject({
  phrase: z.string().min(1),
});

export const selectionPolicySchema: z.ZodType<SelectionPolicy> = z.strictObject({
  ranking: z.enum(["savings-first", "cheapest-per-unit"]),
  brandsOnly: z.array(z.string().min(1)),
  brandsPreferred: z.array(z.string().min(1)),
  brandsExcluded: z.array(z.string().min(1)),
  unexpressed: z.array(z.string().min(1)),
});
