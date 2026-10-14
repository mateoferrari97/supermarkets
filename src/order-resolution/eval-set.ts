import { z } from "zod";
import type { Vocabulary } from "../product-types/schema.ts";
import type { OrderResolution } from "./resolve-order.ts";

const itemDetails = {
  quantity: z.number().positive().optional(),
  brand: z.string().min(1).optional(),
  terms: z.array(z.string().min(1)).min(1).optional(),
};

const productTypeExpectationSchema = z.strictObject({
  productType: z.string().min(1),
  ...itemDetails,
});

const questionExpectationSchema = z.strictObject({
  question: z
    .strictObject({
      group: z.string().min(1).optional(),
      includes: z.array(z.string().min(1)).min(1).optional(),
    })
    .refine(({ group, includes }) => group !== undefined || includes !== undefined, {
      message: "a question expects a group, ids it includes, or both",
    }),
  ...itemDetails,
});

const noItemExpectationSchema = z.strictObject({ noItem: z.string().min(1) });

export const expectedItemSchema = z.union([
  productTypeExpectationSchema,
  questionExpectationSchema,
  noItemExpectationSchema,
]);

export const evalCaseSchema = z.strictObject({
  id: z.string().min(1),
  order: z.string().min(1),
  expectedToFail: z.string().min(1).optional(),
  items: z.array(expectedItemSchema).min(1),
});

export const evalSetSchema = z.strictObject({ cases: z.array(evalCaseSchema).min(1) });

export type ExpectedItem = z.infer<typeof expectedItemSchema>;
export type EvalCase = z.infer<typeof evalCaseSchema>;
export type EvalSet = z.infer<typeof evalSetSchema>;

type ActualItem = OrderResolution["items"][number];
type PresentExpectation = Exclude<ExpectedItem, { noItem: string }>;

export function validateEvalSet(input: unknown, vocabulary: Vocabulary): string[] {
  const parsed = evalSetSchema.safeParse(input);
  if (!parsed.success) {
    return parsed.error.issues.map(
      (issue) => `eval set ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
  }
  const groupIds = new Set(vocabulary.groups.map(({ id }) => id));
  const productTypeIds = new Set(
    vocabulary.groups.flatMap(({ productTypes }) => productTypes.map(({ id }) => id)),
  );
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const evalCase of parsed.data.cases) {
    const where = `eval case "${evalCase.id}"`;
    if (seen.has(evalCase.id)) errors.push(`${where} id is used more than once`);
    seen.add(evalCase.id);
    if (!evalCase.items.some((expected) => !("noItem" in expected))) {
      errors.push(`${where} expects no Item at all`);
    }
    for (const expected of evalCase.items) {
      if ("productType" in expected && !productTypeIds.has(expected.productType)) {
        errors.push(`${where} expects unknown Product Type "${expected.productType}"`);
      }
      if ("question" in expected) {
        const { group, includes = [] } = expected.question;
        if (group !== undefined && !groupIds.has(group)) {
          errors.push(`${where} expects unknown Product Type Group "${group}"`);
        }
        for (const id of includes) {
          if (!productTypeIds.has(id)) errors.push(`${where} expects unknown Product Type "${id}"`);
        }
      }
    }
  }
  return errors;
}

export type CaseScore = { hit: boolean; problems: string[] };

export function scoreCase(
  evalCase: EvalCase,
  resolution: OrderResolution,
  vocabulary: Vocabulary,
): CaseScore {
  const groupChildren = new Map(
    vocabulary.groups.map((group) => [group.id, group.productTypes.map(({ id }) => id)]),
  );
  const present = evalCase.items.filter(
    (expected): expected is PresentExpectation => !("noItem" in expected),
  );
  const problems: string[] = [];

  for (const expected of evalCase.items) {
    if (!("noItem" in expected)) continue;
    const word = normalize(expected.noItem);
    const found = resolution.items.filter(({ phrase }) => normalize(phrase).includes(word));
    for (const { phrase } of found) {
      problems.push(`expected no Item for "${expected.noItem}", got "${phrase}"`);
    }
  }

  if (resolution.items.length !== present.length) {
    problems.push(`expected ${present.length} Items, got ${resolution.items.length}`);
  }

  const matched = matchOneToOne(present, resolution.items, (expected, actual) =>
    satisfies(expected, actual, groupChildren),
  );
  if (!matched) {
    for (const expected of present) {
      if (!resolution.items.some((actual) => satisfies(expected, actual, groupChildren))) {
        problems.push(`no Item matches ${describe(expected)}`);
      }
    }
    if (problems.length === 0) problems.push("the Items cannot be matched one to one");
  }

  return { hit: problems.length === 0, problems };
}

function satisfies(
  expected: PresentExpectation,
  actual: ActualItem,
  groupChildren: Map<string, string[]>,
): boolean {
  if ("productType" in expected) {
    if (actual.status !== "resolved") return false;
    const [only, ...others] = actual.productTypes;
    if (only?.id !== expected.productType || others.length > 0) return false;
  } else {
    if (actual.status !== "pending" || actual.reason === "none") return false;
    const wanted = [
      ...(expected.question.group ? (groupChildren.get(expected.question.group) ?? []) : []),
      ...(expected.question.includes ?? []),
    ];
    const offered = new Set(actual.candidates.map(({ id }) => id));
    if (!wanted.every((id) => offered.has(id))) return false;
  }
  if (expected.quantity !== undefined && actual.quantity !== expected.quantity) return false;
  if (expected.brand !== undefined && normalize(actual.brand ?? "") !== normalize(expected.brand)) {
    return false;
  }
  const terms = new Set(actual.terms.map(normalize));
  return (expected.terms ?? []).every((term) => terms.has(normalize(term)));
}

function matchOneToOne<E, A>(
  expected: E[],
  actual: A[],
  fits: (expected: E, actual: A) => boolean,
): boolean {
  const used = new Set<number>();
  const next = (position: number): boolean => {
    const current = expected[position];
    if (current === undefined) return true;
    for (const [index, candidate] of actual.entries()) {
      if (used.has(index) || !fits(current, candidate)) continue;
      used.add(index);
      if (next(position + 1)) return true;
      used.delete(index);
    }
    return false;
  };
  return next(0);
}

export function describe(expected: ExpectedItem): string {
  if ("noItem" in expected) return `no Item for "${expected.noItem}"`;
  const target =
    "productType" in expected
      ? `Product Type ${expected.productType}`
      : `a question over ${[expected.question.group, ...(expected.question.includes ?? [])]
          .filter(Boolean)
          .join(", ")}`;
  const details = [
    expected.quantity === undefined ? null : `x${expected.quantity}`,
    expected.brand === undefined ? null : `brand ${expected.brand}`,
    expected.terms === undefined ? null : `terms ${expected.terms.join(", ")}`,
  ].filter(Boolean);
  return details.length > 0 ? `${target} [${details.join("; ")}]` : target;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
