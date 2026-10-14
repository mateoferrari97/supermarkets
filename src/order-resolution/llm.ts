import { z } from "zod";

export const splitOrderOutputSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      phrase: z.string().min(1),
      quantity: z.number().positive().nullable(),
      brand: z.string().min(1).nullable(),
      terms: z.array(z.string().min(1)),
      vagueWords: z.array(z.string().min(1)),
    }),
  ),
});

export const resolveItemOutputSchema = z.strictObject({
  kind: z.enum(["match", "ambiguous", "none"]),
  candidates: z.array(z.string()),
});

export type SplitOrderOutput = z.infer<typeof splitOrderOutputSchema>;
export type Item = SplitOrderOutput["items"][number];
export type ResolveItemOutput = z.infer<typeof resolveItemOutputSchema>;

export type Evidence = { product: string; productTypeId: string; productTypeName: string };

export type ResolveItemInput = { item: Item; evidence: Evidence[] };

export type Llm = {
  splitOrder(orderText: string): Promise<SplitOrderOutput>;
  resolveItem(input: ResolveItemInput): Promise<ResolveItemOutput>;
};
