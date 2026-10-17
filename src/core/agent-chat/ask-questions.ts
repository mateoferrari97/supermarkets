import { z } from "zod";
import { openOrderOf } from "./order.ts";
import type { OrdersStore } from "./orders-store.ts";
import { renderRound, type Round, type RoundQuestion } from "./round.ts";
import type { TurnOutcome } from "./tool.ts";

export const askQuestionsInput = z.object({
  questions: z
    .array(
      z.object({
        ref: z
          .string()
          .optional()
          .describe("The ref of the resolveItem result this question is about, if any."),
        text: z.string().describe("The question, in the Owner's language, short."),
        options: z
          .array(
            z.object({
              productId: z
                .string()
                .optional()
                .describe("The productId of an option resolveItem returned for that ref."),
              label: z.string().optional().describe("The text of an option that is not a product."),
            }),
          )
          .min(1)
          .max(6)
          .describe("Each option has either a productId or a label."),
        recommended: z
          .number()
          .int()
          .describe("The position, starting at 1, of the option you recommend."),
      }),
    )
    .min(1)
    .max(8)
    .describe("Every open question of this turn. Ask them all in this single call."),
});

export type AskQuestionsOutput =
  | { kind: "asked"; questions: number }
  | {
      kind: "refused";
      reason:
        | "round-already-asked"
        | "unknown-ref"
        | "not-an-alternative"
        | "bad-option"
        | "bad-recommended";
      question: number | null;
    };

export type AskQuestionsDependencies = { orders: OrdersStore; outcome: TurnOutcome };

export function askQuestions(
  input: z.infer<typeof askQuestionsInput>,
  { orders, outcome }: AskQuestionsDependencies,
): Promise<AskQuestionsOutput> {
  const refuse = (
    reason: Extract<AskQuestionsOutput, { kind: "refused" }>["reason"],
    question: number | null,
  ): Promise<AskQuestionsOutput> => Promise.resolve({ kind: "refused", reason, question });
  if (outcome.ended !== null) return refuse("round-already-asked", null);
  const order = openOrderOf(orders.load());
  const questions: RoundQuestion[] = [];
  for (const [index, asked] of input.questions.entries()) {
    const number = index + 1;
    const ref = asked.ref ?? null;
    const entry = ref === null ? undefined : order?.items.find((item) => item.ref === ref);
    if (ref !== null && entry === undefined) return refuse("unknown-ref", number);
    const options: RoundQuestion["options"] = [];
    for (const option of asked.options) {
      const label = option.label?.trim() ?? "";
      if ((option.productId === undefined) === (label === "")) return refuse("bad-option", number);
      if (option.productId === undefined) {
        options.push({ label, productId: null, price: null });
        continue;
      }
      const product =
        entry?.kind === "choose"
          ? entry.alternatives.find((each) => each.productId === option.productId)
          : undefined;
      if (product === undefined) return refuse("not-an-alternative", number);
      options.push({ label: product.name, productId: product.productId, price: product.price });
    }
    if (asked.recommended < 1 || asked.recommended > options.length) {
      return refuse("bad-recommended", number);
    }
    questions.push({
      number,
      ref,
      text: asked.text.trim(),
      options,
      recommended: asked.recommended,
    });
  }
  const round: Round = { questions };
  outcome.ended = { text: renderRound(round), parts: [{ type: "round", round }] };
  return Promise.resolve({ kind: "asked", questions: questions.length });
}
