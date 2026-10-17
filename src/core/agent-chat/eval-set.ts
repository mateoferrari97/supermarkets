import { z } from "zod";

export const AGENT_STORIES = [
  "postal-code-once",
  "change-postal-code",
  "add-to-past-order",
  "repeat-order",
  "precise-product",
  "more-options",
  "one-round",
  "confirm-first",
  "correction",
  "plan",
  "off-topic",
] as const;

export type AgentStory = (typeof AGENT_STORIES)[number];

export const AGENT_TOOL_NAMES = [
  "updateProfile",
  "resolveItem",
  "chooseAlternative",
  "reopenLastOrder",
  "repeatOrder",
  "searchCatalog",
  "askQuestions",
  "proposeOrder",
  "proposePlan",
  "buildCart",
] as const;

export const TURN_ENDS = ["text", "round", "proposal", "cart"] as const;

export type TurnEnd = (typeof TURN_ENDS)[number];

const toolName = z.enum(AGENT_TOOL_NAMES);

const words = z.array(z.string().min(1)).min(1);

export const turnSchema = z.strictObject({
  owner: z.string().min(1),
  ends: z.enum(TURN_ENDS),
  calls: z.array(toolName).optional(),
  noCalls: z.array(toolName).optional(),
  minQuestions: z.number().int().positive().optional(),
  moreOptions: z.boolean().optional(),
});

export const cartLineSchema = z.strictObject({
  product: z.string().min(1),
  fits: words,
  quantity: z.number().positive().optional(),
});

export const cartExpectationSchema = z.strictObject({
  lines: z.array(cartLineSchema).optional(),
  exact: z.boolean().optional(),
  minLines: z.number().int().positive().optional(),
});

export const pastOrderSchema = z.strictObject({
  lines: z
    .array(z.strictObject({ productId: z.string().min(1), quantity: z.number().positive() }))
    .min(1),
});

export const setupSchema = z.strictObject({
  postalCode: z
    .string()
    .regex(/^\d{4}$/)
    .nullable(),
  doesNotDeliver: z.array(z.string().regex(/^\d{4}$/)).optional(),
  chat: z
    .array(z.strictObject({ role: z.enum(["owner", "assistant"]), text: z.string().min(1) }))
    .optional(),
  pastOrders: z.array(pastOrderSchema).optional(),
});

export const agentCaseSchema = z.strictObject({
  id: z.string().min(1),
  covers: z.array(z.enum(AGENT_STORIES)).min(1),
  expectedToFail: z.string().min(1).optional(),
  setup: setupSchema,
  turns: z.array(turnSchema).min(1),
  postalCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
  cart: z.union([z.null(), cartExpectationSchema]).optional(),
});

export const agentEvalSetSchema = z.strictObject({ cases: z.array(agentCaseSchema).min(1) });

export type AgentTurnCase = z.infer<typeof turnSchema>;
export type CartExpectation = z.infer<typeof cartExpectationSchema>;
export type AgentCase = z.infer<typeof agentCaseSchema>;
export type AgentEvalSet = z.infer<typeof agentEvalSetSchema>;

export type StaleId = { caseId: string; productId: string; reason: "missing" | "out of stock" };

export function validateAgentEvalSet(input: unknown): string[] {
  const parsed = agentEvalSetSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `agent eval set ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const evalCase of parsed.data.cases) {
    if (seen.has(evalCase.id)) errors.push(`case "${evalCase.id}" id is used more than once`);
    seen.add(evalCase.id);
    for (const error of caseErrors(evalCase)) errors.push(`case "${evalCase.id}" ${error}`);
  }
  const covered = new Set(parsed.data.cases.flatMap(({ covers }) => covers));
  for (const story of AGENT_STORIES) {
    if (!covered.has(story)) errors.push(`no case covers ${story}`);
  }
  return errors;
}

function caseErrors({ turns, cart, postalCode, setup }: AgentCase): string[] {
  const errors: string[] = [];
  for (const [index, turn] of turns.entries()) {
    const where = `turn ${String(index + 1)}`;
    for (const name of turn.calls ?? []) {
      if (turn.noCalls?.includes(name)) errors.push(`${where} requires and forbids ${name}`);
    }
    if (turn.minQuestions !== undefined && turn.ends !== "round") {
      errors.push(`${where} expects questions but does not end with a round`);
    }
  }
  const last = turns.at(-1);
  if (cart !== undefined && cart !== null && last?.ends !== "cart") {
    errors.push("expects a cart but its last turn does not end with one");
  }
  if (cart === null && turns.some(({ ends }) => ends === "cart")) {
    errors.push("expects no cart but a turn ends with one");
  }
  if (cart && cart.lines === undefined && cart.minLines === undefined) {
    errors.push("scores a cart with neither lines nor minLines");
  }
  if (postalCode !== undefined && !turns.some(({ calls }) => calls?.includes("updateProfile"))) {
    errors.push("expects a postal code but no turn calls updateProfile");
  }
  if (setup.postalCode === null && setup.pastOrders !== undefined) {
    errors.push("has past Orders but no postal code");
  }
  return errors;
}

export function agentEvalSetIds({ cases }: AgentEvalSet): { caseId: string; ids: string[] }[] {
  return cases.map((evalCase) => ({
    caseId: evalCase.id,
    ids: [
      ...new Set([
        ...(evalCase.setup.pastOrders ?? []).flatMap(({ lines }) =>
          lines.map(({ productId }) => productId),
        ),
        ...(evalCase.cart?.lines ?? []).flatMap(({ fits }) => fits),
      ]),
    ],
  }));
}

export function staleIds(evalSet: AgentEvalSet, inStock: ReadonlyMap<string, boolean>): StaleId[] {
  return agentEvalSetIds(evalSet).flatMap(({ caseId, ids }) =>
    ids.flatMap((productId): StaleId[] => {
      const stock = inStock.get(productId);
      if (stock === true) return [];
      return [{ caseId, productId, reason: stock === false ? "out of stock" : "missing" }];
    }),
  );
}
