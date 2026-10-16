import { z } from "zod";
import {
  parseQuantity,
  parseSize,
  QUANTITY_PATTERN,
  SIZE_PATTERN,
} from "../../core/order-matching/item.ts";
import { TOPICS } from "../../core/planning/route-message.ts";

export const lineSchema = z.strictObject({
  original: z.string().min(1),
  product: z.string().min(1),
  brand: z.string().min(1).nullable(),
  size: z
    .string()
    .regex(SIZE_PATTERN)
    .refine((text) => parseSize(text) !== null, { message: "Size is not a positive amount" }),
  quantity: z
    .string()
    .regex(QUANTITY_PATTERN)
    .refine((text) => parseQuantity(text) !== null, {
      message: "Quantity is not a positive amount",
    }),
});

export type LineOutput = z.infer<typeof lineSchema>;

export const routeMessageOutputSchema = z.strictObject({
  topic: z.enum(TOPICS),
});

const planSchema = z.strictObject({
  title: z.string().min(1),
  idea: z.array(z.strictObject({ heading: z.string().min(1), text: z.string().min(1) })),
  lines: z.array(
    z.strictObject({
      productId: z.string().min(1),
      quantity: z.number(),
      purpose: z.string().min(1),
      reason: z.string().min(1),
    }),
  ),
});

export const planOutputSchema = z
  .strictObject({
    kind: z.enum(["search", "answer"]),
    queries: z.array(z.string().min(1)),
    message: z.string().min(1).nullable(),
    plan: planSchema.nullable(),
    budget: z.number().nullable(),
  })
  .refine((output) => output.kind !== "search" || output.queries.length > 0, {
    message: "A search has no queries",
  })
  .refine((output) => output.kind !== "answer" || output.message !== null, {
    message: "An answer has no message",
  });

export const parseOrderOutputSchema = z.strictObject({
  lines: z.array(lineSchema).min(1),
  ignoredPreference: z.boolean(),
});

export const fitProductsOutputSchema = z.strictObject({
  fits: z.array(z.number().int().positive()),
  closest: z.array(z.number().int().positive()),
  note: z.string().min(1).nullable(),
  question: z.string().min(1).nullable(),
});

const itemNumber = z.number().int().positive();

export const readReplyOutputSchema = z.strictObject({
  entries: z.array(
    z.discriminatedUnion("kind", [
      z.strictObject({
        item: itemNumber,
        kind: z.literal("choice"),
        alternative: z.number().int().positive(),
      }),
      z.strictObject({
        item: itemNumber,
        kind: z.literal("lines"),
        lines: z.array(lineSchema).min(1),
      }),
      z.strictObject({ item: itemNumber, kind: z.literal("drop") }),
      z.strictObject({
        item: itemNumber,
        kind: z.literal("unanswered"),
        question: z.string().min(1).nullable(),
      }),
    ]),
  ),
  newLines: z.array(lineSchema),
  ignoredPreference: z.boolean(),
});
