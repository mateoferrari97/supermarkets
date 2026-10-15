import { z } from "zod";
import type { CatalogProduct } from "./catalog-product.ts";
import type { Item } from "./item.ts";
import type { ReadReplyInput, ReadReplyOutput, ReplyEntry } from "./read-reply.ts";

const productIdSchema = z.string().min(1);

const askedItemSchema = z.strictObject({
  original: z.string().min(1),
  question: z.string().min(1),
  alternatives: z.array(productIdSchema).min(1).max(5),
});

const boughtItemSchema = z.strictObject({
  original: z.string().min(1),
  bought: productIdSchema,
});

const expectedLineSchema = z.strictObject({
  product: z.string().min(1),
  brand: z.string().min(1).nullable(),
});

const expectedEntrySchema = z.discriminatedUnion("kind", [
  z.strictObject({
    item: z.number().int().min(1),
    kind: z.literal("choice"),
    alternative: z.number().int().min(1),
  }),
  z.strictObject({
    item: z.number().int().min(1),
    kind: z.literal("lines"),
    lines: z.array(expectedLineSchema).min(1),
  }),
  z.strictObject({ item: z.number().int().min(1), kind: z.literal("drop") }),
  z.strictObject({ item: z.number().int().min(1), kind: z.literal("unanswered") }),
]);

export const answerCaseSchema = z.strictObject({
  id: z.string().min(1),
  expectedToFail: z.string().min(1).optional(),
  items: z.array(z.union([askedItemSchema, boughtItemSchema])).min(1),
  reply: z.string().min(1),
  entries: z.array(expectedEntrySchema),
  newLines: z.array(expectedLineSchema),
  ignoredPreference: z.boolean().optional(),
});

export type AnswerCase = z.infer<typeof answerCaseSchema>;
export type ExpectedLine = z.infer<typeof expectedLineSchema>;

export type AnswerScore = { passed: boolean; problems: string[] };

export type AnswerRun =
  { error: string } | { error: null; output: ReadReplyOutput; score: AnswerScore };

export type AnswerCaseRuns = { answerCase: AnswerCase; runs: AnswerRun[] };

export function answerCaseErrors(answerCase: AnswerCase): string[] {
  const errors: string[] = [];
  const seen = new Set<number>();
  for (const entry of answerCase.entries) {
    const where = `entry for item ${String(entry.item)}`;
    const item = answerCase.items[entry.item - 1];
    if (item === undefined) {
      errors.push(`${where} is outside its items`);
      continue;
    }
    if (seen.has(entry.item)) errors.push(`${where} is repeated`);
    seen.add(entry.item);
    const asked = "alternatives" in item;
    if (entry.kind === "choice" && !asked) errors.push(`${where} chooses for an Item in the cart`);
    if (entry.kind === "choice" && asked && entry.alternative > item.alternatives.length) {
      errors.push(`${where} chooses alternative ${String(entry.alternative)}, which it lacks`);
    }
  }
  for (const [index, item] of answerCase.items.entries()) {
    if ("alternatives" in item && !seen.has(index + 1)) {
      errors.push(`asked item ${String(index + 1)} has no expected entry`);
    }
    for (const id of repeated("alternatives" in item ? item.alternatives : [])) {
      errors.push(`item ${String(index + 1)} repeats ${id}`);
    }
  }
  return errors;
}

export function answerCaseIds(answerCase: AnswerCase): string[] {
  return [
    ...new Set(
      answerCase.items.flatMap((item) =>
        "alternatives" in item ? item.alternatives : [item.bought],
      ),
    ),
  ];
}

export function replyInputOf(
  answerCase: AnswerCase,
  productOf: (productId: string) => CatalogProduct | undefined,
): ReadReplyInput {
  const product = (productId: string) => {
    const found = productOf(productId);
    if (!found) throw new Error(`product ${productId} is not in the Catalog Snapshot`);
    return found;
  };
  return {
    items: answerCase.items.map((item) =>
      "alternatives" in item
        ? {
            kind: "asked",
            original: item.original,
            question: { text: item.question, alternatives: item.alternatives.map(product) },
          }
        : { kind: "bought", original: item.original, product: product(item.bought) },
    ),
    reply: answerCase.reply,
  };
}

export function scoreAnswer(answerCase: AnswerCase, output: ReadReplyOutput): AnswerScore {
  const problems: string[] = [];
  const actual = new Map(output.entries.map((entry) => [entry.item, entry]));
  const expected = new Map(answerCase.entries.map((entry) => [entry.item, entry]));
  for (const number of answerCase.items.keys()) {
    const item = number + 1;
    const want = expected.get(item);
    const got = actual.get(item);
    if (!want && !got) continue;
    const problem = !want
      ? `item ${String(item)} expects no entry, got ${describeEntry(got!)}`
      : !got
        ? `item ${String(item)} expects ${describeExpected(want)}, got no entry`
        : entryProblem(want, got);
    if (problem !== null) problems.push(problem);
  }
  if (!linesMatch(answerCase.newLines, output.newLines)) {
    problems.push(
      `newLines expect ${describeLines(answerCase.newLines)}, got ${describeLines(output.newLines)}`,
    );
  }
  const wantPreference = answerCase.ignoredPreference ?? false;
  if (output.ignoredPreference !== wantPreference) {
    problems.push(`ignoredPreference expects ${String(wantPreference)}`);
  }
  return { passed: problems.length === 0, problems };
}

export function answerCasePassed({ runs }: AnswerCaseRuns): boolean {
  return runs.length > 0 && runs.every((run) => run.error === null && run.score.passed);
}

export function unexpectedAnswerFailures(cases: readonly AnswerCaseRuns[]): string[] {
  return cases
    .filter((runs) => runs.answerCase.expectedToFail === undefined && !answerCasePassed(runs))
    .map(({ answerCase }) => answerCase.id);
}

type ExpectedEntry = AnswerCase["entries"][number];

function entryProblem(want: ExpectedEntry, got: ReplyEntry): string | null {
  const wrong = `item ${String(want.item)} expects ${describeExpected(want)}, got ${describeEntry(got)}`;
  if (want.kind !== got.kind) return wrong;
  if (want.kind === "choice" && got.kind === "choice") {
    return want.alternative === got.alternative ? null : wrong;
  }
  if (want.kind === "lines" && got.kind === "lines") {
    return linesMatch(want.lines, got.lines) ? null : wrong;
  }
  return null;
}

function linesMatch(want: readonly ExpectedLine[], got: readonly Item[]): boolean {
  return (
    want.length === got.length &&
    want.every((line, index) => {
      const actual = got[index]!;
      const words = new Set(wordsOf(actual.product));
      return (
        wordsOf(line.product).every((word) => words.has(word)) &&
        normalized(line.brand ?? "") === normalized(actual.brand ?? "")
      );
    })
  );
}

function describeExpected(entry: ExpectedEntry): string {
  switch (entry.kind) {
    case "choice":
      return `choice ${String(entry.alternative)}`;
    case "lines":
      return `lines ${describeLines(entry.lines)}`;
    default:
      return entry.kind;
  }
}

function describeEntry(entry: ReplyEntry): string {
  switch (entry.kind) {
    case "choice":
      return `choice ${String(entry.alternative)}`;
    case "lines":
      return `lines ${describeLines(entry.lines)}`;
    case "drop":
      return "drop";
    case "unanswered":
      return entry.question === null ? "unanswered" : `unanswered "${entry.question}"`;
  }
}

function describeLines(lines: readonly (ExpectedLine | Item)[]): string {
  if (lines.length === 0) return "none";
  return lines.map(({ product, brand }) => `${product} (${brand ?? "no brand"})`).join(", ");
}

function wordsOf(text: string): string[] {
  return normalized(text)
    .split(/[^a-z0-9]+/u)
    .filter(Boolean);
}

function normalized(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function repeated(ids: readonly string[]): string[] {
  return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
}
