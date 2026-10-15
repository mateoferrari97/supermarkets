import { z } from "zod";
import { parseQuantity } from "./item.ts";

const productIdsSchema = z.array(z.string().min(1)).min(1);

export const expectedItemSchema = z.strictObject({
  product: z.string().min(1),
  brand: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).nullable(),
  size: z.enum(["common", "biggest", "smallest", "exact"]),
  quantity: z.string().refine((text) => parseQuantity(text) !== null, {
    message: 'expected "minimum", "<n> unit" or "<amount> <g|kg>"',
  }),
  fits: productIdsSchema.optional(),
  pick: productIdsSchema.optional(),
  alternatives: productIdsSchema.optional(),
});

export const evalCaseSchema = z.strictObject({
  id: z.string().min(1),
  order: z.string().min(1),
  expectedToFail: z.string().min(1).optional(),
  ignoredPreference: z.boolean().optional(),
  notItems: z.array(z.string().min(1)).optional(),
  items: z.array(expectedItemSchema).min(1),
});

export const evalSetSchema = z.strictObject({ cases: z.array(evalCaseSchema).min(1) });

export type ExpectedItem = z.infer<typeof expectedItemSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalSet = z.infer<typeof evalSetSchema>;

export type StaleId = {
  caseId: string;
  productId: string;
  reason: "missing" | "out of stock";
};

export function exampleOrders(promptText: string): string[] {
  return [...promptText.matchAll(/<order>([\s\S]*?)<\/order>/g)].map(([, order]) =>
    sameText(order ?? ""),
  );
}

export function validateEvalSet(input: unknown, examples: readonly string[]): string[] {
  const parsed = evalSetSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `eval set ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const exampleSet = new Set(examples.map(sameText));
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const evalCase of parsed.data.cases) {
    const where = `eval case "${evalCase.id}"`;
    if (seen.has(evalCase.id)) errors.push(`${where} id is used more than once`);
    seen.add(evalCase.id);
    if (exampleSet.has(sameText(evalCase.order))) {
      errors.push(`${where} order is an example order of the prompts`);
    }
    for (const [index, item] of evalCase.items.entries()) {
      errors.push(...itemErrors(item).map((error) => `${where} item ${index + 1} ${error}`));
    }
  }
  return errors;
}

function itemErrors({ fits, pick, alternatives }: ExpectedItem): string[] {
  const errors: string[] = [];
  if ((fits === undefined) === (alternatives === undefined)) {
    errors.push("has to have either fits or alternatives");
  }
  if (pick !== undefined && fits === undefined) errors.push("has a pick without fits");
  for (const id of pick ?? []) {
    if (!fits?.includes(id)) errors.push(`picks ${id}, which is not among its fits`);
  }
  for (const ids of [fits, pick, alternatives]) {
    for (const id of repeated(ids ?? [])) errors.push(`repeats ${id}`);
  }
  return errors;
}

export function staleIds(evalSet: EvalSet, inStock: ReadonlyMap<string, boolean>): StaleId[] {
  return evalSet.cases.flatMap((evalCase) =>
    [...new Set(evalCase.items.flatMap(expectedIds))].flatMap((productId): StaleId[] => {
      const stock = inStock.get(productId);
      if (stock === true) return [];
      return [
        { caseId: evalCase.id, productId, reason: stock === false ? "out of stock" : "missing" },
      ];
    }),
  );
}

export function expectedIds({ fits, alternatives }: ExpectedItem): string[] {
  return [...(fits ?? []), ...(alternatives ?? [])];
}

function repeated(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}

function sameText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}
