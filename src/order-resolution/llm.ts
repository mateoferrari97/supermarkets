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
  postalCode: z.string().min(1).nullable(),
});

export const resolveItemOutputSchema = z.strictObject({
  kind: z.enum(["match", "ambiguous", "none"]),
  candidates: z.array(z.string()),
});

export const mapAnswerOutputSchema = z.strictObject({
  answers: z.array(
    z.strictObject({
      question: z.number().int().positive(),
      kind: z.enum(["chosen", "any", "rephrased", "unclear"]),
      options: z.array(z.number().int().positive()),
      phrase: z.string().min(1).nullable(),
    }),
  ),
});

export const rewordItemOutputSchema = z.strictObject({ phrase: z.string().min(1) });

export type SplitOrderOutput = z.infer<typeof splitOrderOutputSchema>;
export type Item = SplitOrderOutput["items"][number];
export type ResolveItemOutput = z.infer<typeof resolveItemOutputSchema>;

export type MapAnswerOutput = z.infer<typeof mapAnswerOutputSchema>;
export type RewordItemOutput = z.infer<typeof rewordItemOutputSchema>;

export type Evidence = { product: string; productTypeId: string; productTypeName: string };

export type ResolveItemInput = { item: Item; evidence: Evidence[] };

export type QuestionInput = {
  question: number;
  phrase: string;
  asks: "productType" | "phrase" | "term" | "size" | "postalCode";
  term: string | null;
  options: { option: number; name: string }[];
};

export type MapAnswerInput = { questions: QuestionInput[]; answer: string };

export type Llm = {
  splitOrder(orderText: string): Promise<SplitOrderOutput>;
  resolveItem(input: ResolveItemInput): Promise<ResolveItemOutput>;
  rewordItem(input: ResolveItemInput): Promise<RewordItemOutput>;
  mapAnswer(input: MapAnswerInput): Promise<MapAnswerOutput>;
};
