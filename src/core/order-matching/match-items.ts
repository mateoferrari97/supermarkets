import { stepsFrom, type Steps } from "./steps.ts";
import type { CatalogProduct } from "./catalog-product.ts";
import { MATCHES_LIMIT, type CatalogSearch } from "./catalog-search.ts";
import { inParallel } from "./in-parallel.ts";
import type { Item } from "./item.ts";

export const FIT_PRODUCTS_CONCURRENCY = 10;
export const ALTERNATIVES_LIMIT = 5;

export type FitProductsInput = {
  item: Item;
  alsoInThisLine: string[];
  matches: CatalogProduct[];
};

export type FitProductsOutput = {
  fits: number[];
  closest: number[];
  note: string | null;
  question: string | null;
};

export type FitProductsLlm = {
  fitProducts(input: FitProductsInput, signal: AbortSignal): Promise<FitProductsOutput>;
};

export type Question = { text: string; alternatives: CatalogProduct[] };

export type ItemMatch = {
  item: Item;
  matches: CatalogProduct[];
  fits: CatalogProduct[];
  note: string | null;
  question: Question | null;
};

export type MatchItemsDependencies = { search: CatalogSearch; llm: FitProductsLlm };

export async function matchItems(
  items: Item[],
  { search, llm }: MatchItemsDependencies,
  steps: Steps = stepsFrom(),
): Promise<ItemMatch[]> {
  return inParallel(items, FIT_PRODUCTS_CONCURRENCY, steps.signal, (item, index) =>
    steps.run({ kind: "choose-products", original: item.original }, async () => {
      const matches = search.findMatches(item, "order", MATCHES_LIMIT);
      const alsoInThisLine = items
        .filter((other, otherIndex) => otherIndex !== index && other.original === item.original)
        .map((other) => other.product);
      const output = await checkedFitProducts(llm, { item, alsoInThisLine, matches }, steps.signal);
      const products = (numbers: number[]) => numbers.map((number) => matches[number - 1]!);
      return {
        item,
        matches,
        fits: products(output.fits),
        note: output.note,
        question:
          output.question === null
            ? null
            : {
                text: output.question,
                alternatives: products(output.closest),
              },
      };
    }),
  );
}

export async function checkedFitProducts(
  llm: FitProductsLlm,
  input: FitProductsInput,
  signal: AbortSignal,
): Promise<FitProductsOutput> {
  return checkFitProducts(input, await llm.fitProducts(input, signal));
}

export function checkFitProducts(
  { item, matches }: FitProductsInput,
  output: FitProductsOutput,
): FitProductsOutput {
  const fail = (rule: string): never => {
    throw new Error(`fit-products answer for Item "${item.original}" breaks a rule: ${rule}`);
  };
  const outside = [...output.fits, ...output.closest].filter(
    (number) => !Number.isInteger(number) || number < 1 || number > matches.length,
  );
  if (outside.length > 0) {
    fail(`${outside.join(", ")} not among its ${String(matches.length)} Matches`);
  }
  if ((output.question === null) !== output.fits.length > 0) {
    fail("a question must be set exactly when no product fits");
  }
  if (output.closest.length > 0 && output.fits.length > 0) {
    fail("no Alternatives while products fit");
  }
  if (output.closest.length > ALTERNATIVES_LIMIT) {
    fail(`${String(output.closest.length)} Alternatives, more than ${String(ALTERNATIVES_LIMIT)}`);
  }
  return output;
}
