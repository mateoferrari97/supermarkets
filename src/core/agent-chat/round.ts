import { z } from "zod";
import { money } from "../product-selection/cart.ts";

export const roundOptionSchema = z.object({
  label: z.string().min(1),
  productId: z.string().nullable(),
  price: z.number().nullable(),
});

export type RoundOption = z.infer<typeof roundOptionSchema>;

export const roundQuestionSchema = z
  .object({
    number: z.number().int().positive(),
    ref: z.string().nullable(),
    text: z.string().min(1),
    options: z.array(roundOptionSchema).min(1),
    recommended: z.number().int().positive(),
  })
  .refine((question) => question.recommended <= question.options.length, {
    message: "the recommended option must be one of the options",
    path: ["recommended"],
  });

export type RoundQuestion = z.infer<typeof roundQuestionSchema>;

export const roundSchema = z.object({ questions: z.array(roundQuestionSchema).min(1) });

export type Round = z.infer<typeof roundSchema>;

export const optionLetter = (index: number): string => String.fromCharCode(97 + index);

export function renderRound({ questions }: Round): string {
  return [
    "Necesito que me confirmes algunas cosas:",
    ...questions.flatMap((question) => [
      `${String(question.number)}. ${question.text}`,
      ...question.options.map((option, index) => {
        const price = option.price === null ? "" : ` (${money(option.price)})`;
        const recommended = index + 1 === question.recommended ? " — recomendada" : "";
        return `   ${optionLetter(index)}) ${option.label}${price}${recommended}`;
      }),
    ]),
    "Respondé con la letra de cada pregunta o aceptá las recomendadas.",
  ].join("\n");
}
