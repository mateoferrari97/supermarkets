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
  paymentCard: z.string().min(1).nullable(),
  preference: z.string().min(1).nullable(),
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

export const selectionPolicySchema = z.strictObject({
  ranking: z.enum(["savings-first", "cheapest-per-unit"]),
  brandsOnly: z.array(z.string().min(1)),
  brandsPreferred: z.array(z.string().min(1)),
  brandsExcluded: z.array(z.string().min(1)),
  unexpressed: z.array(z.string().min(1)),
});

export type SplitOrderOutput = z.infer<typeof splitOrderOutputSchema>;
export type Item = SplitOrderOutput["items"][number];
export type ResolveItemOutput = z.infer<typeof resolveItemOutputSchema>;

export type MapAnswerOutput = z.infer<typeof mapAnswerOutputSchema>;
export type RewordItemOutput = z.infer<typeof rewordItemOutputSchema>;
export type SelectionPolicy = z.infer<typeof selectionPolicySchema>;

export const DEFAULT_SELECTION_POLICY: SelectionPolicy = {
  ranking: "savings-first",
  brandsOnly: [],
  brandsPreferred: [],
  brandsExcluded: [],
  unexpressed: [],
};

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

export type TranslatePreferenceInput = { preference: string };

export type Llm = {
  splitOrder(orderText: string): Promise<SplitOrderOutput>;
  resolveItem(input: ResolveItemInput): Promise<ResolveItemOutput>;
  rewordItem(input: ResolveItemInput): Promise<RewordItemOutput>;
  mapAnswer(input: MapAnswerInput): Promise<MapAnswerOutput>;
  translatePreference(input: TranslatePreferenceInput): Promise<SelectionPolicy>;
};
