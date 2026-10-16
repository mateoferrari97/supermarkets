import { z } from "zod";
import { TOPICS } from "./route-message.ts";

export const SPEC_CASES = [
  "recipe",
  "event",
  "weekly-menu",
  "gift",
  "advice",
  "constraints",
  "idea-in-cart",
  "off-topic",
] as const;

export type SpecCase = (typeof SPEC_CASES)[number];

const words = z.array(z.string().min(1)).min(1);

export const routeCaseSchema = z.strictObject({
  id: z.string().min(1),
  message: z.string().min(1),
  topic: z.enum(TOPICS),
  expectedToFail: z.string().min(1).optional(),
});

export const quantityRangeSchema = z.strictObject({
  label: z.string().min(1),
  productIds: words,
  unit: z.enum(["g", "ml", "unit"]),
  min: z.number().nonnegative(),
  max: z.number().positive(),
});

export const planCaseSchema = z.strictObject({
  id: z.string().min(1),
  message: z.string().min(1),
  covers: z.array(z.enum(SPEC_CASES)).min(1),
  plan: z.boolean(),
  expectedToFail: z.string().min(1).optional(),
  budget: z.number().positive().optional(),
  quantities: z.array(quantityRangeSchema).optional(),
  forbiddenProductIds: words.optional(),
  forbiddenWords: words.optional(),
  allowedWords: words.optional(),
  idea: z.strictObject({ headings: words.optional(), min: z.number().int().positive() }).optional(),
});

export const planningEvalSetSchema = z.strictObject({
  routes: z.array(routeCaseSchema),
  plans: z.array(planCaseSchema),
});

export type RouteCase = z.infer<typeof routeCaseSchema>;
export type QuantityRange = z.infer<typeof quantityRangeSchema>;
export type PlanCase = z.infer<typeof planCaseSchema>;
export type PlanningEvalSet = z.infer<typeof planningEvalSetSchema>;

export function examplePlanningMessages(promptText: string): string[] {
  const messages = [...promptText.matchAll(/<message>([\s\S]*?)<\/message>/g)];
  const conversations = [...promptText.matchAll(/<conversation>\s*<owner>([\s\S]*?)<\/owner>/g)];
  return [...messages, ...conversations].map(([, text]) => sameText(text ?? ""));
}

export function validatePlanningEvalSet(input: unknown, examples: readonly string[]): string[] {
  const parsed = planningEvalSetSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `planning eval set ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const exampleSet = new Set(examples.map(sameText));
  const errors: string[] = [];
  const seen = new Set<string>();
  const cases = [
    ...parsed.data.routes.map((routeCase) => ({ kind: "routing", ...routeCase })),
    ...parsed.data.plans.map((planCase) => ({ kind: "plan", ...planCase })),
  ];
  for (const { kind, id, message } of cases) {
    const where = `${kind} case "${id}"`;
    if (seen.has(id)) errors.push(`${where} id is used more than once`);
    seen.add(id);
    if (exampleSet.has(sameText(message))) {
      errors.push(`${where} message is an example message of the prompts`);
    }
  }
  for (const planCase of parsed.data.plans) {
    errors.push(...planCaseErrors(planCase).map((error) => `plan case "${planCase.id}" ${error}`));
  }
  const covered = new Set<SpecCase>([
    ...parsed.data.plans.flatMap(({ covers }) => covers),
    ...parsed.data.routes.flatMap(({ topic }) =>
      topic === "off-topic" ? ["off-topic" as const] : [],
    ),
  ]);
  for (const specCase of SPEC_CASES) {
    if (!covered.has(specCase)) errors.push(`no case covers ${specCase}`);
  }
  return errors;
}

function planCaseErrors(planCase: PlanCase): string[] {
  const errors: string[] = [];
  for (const { label, min, max } of planCase.quantities ?? []) {
    if (min > max) errors.push(`range "${label}" has a minimum above its maximum`);
  }
  const scoresPlan =
    planCase.budget !== undefined ||
    planCase.quantities !== undefined ||
    planCase.forbiddenProductIds !== undefined ||
    planCase.forbiddenWords !== undefined ||
    planCase.idea !== undefined;
  if (!planCase.plan && scoresPlan) errors.push("expects no Plan but scores one");
  return errors;
}

export function planningEvalSetIds({
  plans,
}: PlanningEvalSet): { caseId: string; ids: string[] }[] {
  return plans.map((planCase) => ({
    caseId: planCase.id,
    ids: [
      ...new Set([
        ...(planCase.quantities ?? []).flatMap(({ productIds }) => productIds),
        ...(planCase.forbiddenProductIds ?? []),
      ]),
    ],
  }));
}

function sameText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
