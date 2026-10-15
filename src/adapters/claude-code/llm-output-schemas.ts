import { z } from "zod";
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
  ignoredPreference: z.boolean(),
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

export const parseOrderOutputSchema = z.strictObject({
  lines: z
    .array(
      z.strictObject({
        original: z.string().min(1),
        product: z.string().min(1),
        brand: z.string().min(1).nullable(),
        size: z.string().regex(/^(common|biggest|smallest|\d+(\.\d+)? (ml|l|g|kg))$/),
        quantity: z.string().regex(/^(minimum|\d+ unit|\d+(\.\d+)? (g|kg))$/),
      }),
    )
    .min(1),
  ignoredPreference: z.boolean(),
});

export const fitProductsOutputSchema = z.strictObject({
  fits: z.array(z.number().int().positive()),
  closest: z.array(z.number().int().positive()),
  note: z.string().min(1).nullable(),
  question: z.string().min(1).nullable(),
});
