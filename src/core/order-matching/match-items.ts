import { stepsFrom, type StepOptions } from "../order-conversation/steps.ts";
import type { CatalogProduct } from "./catalog-product.ts";
import { MATCHES_LIMIT, type CatalogSearch } from "./catalog-search.ts";
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
  options: StepOptions = {},
): Promise<ItemMatch[]> {
  const steps = stepsFrom(options);
  return inParallel(items, FIT_PRODUCTS_CONCURRENCY, steps.signal, (item, index) =>
    steps.run({ kind: "choose-products", original: item.original }, async () => {
      const matches = search.findMatches(item, MATCHES_LIMIT);
      const alsoInThisLine = items
        .filter((other, otherIndex) => otherIndex !== index && other.original === item.original)
        .map((other) => other.product);
      const output = await llm.fitProducts({ item, alsoInThisLine, matches }, steps.signal);
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
                alternatives: products(output.closest.slice(0, ALTERNATIVES_LIMIT)),
              },
      };
    }),
  );
}

async function inParallel<T, R>(
  values: T[],
  limit: number,
  signal: AbortSignal,
  work: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  let failed = false;
  const worker = async () => {
    while (next < values.length && !failed) {
      signal.throwIfAborted();
      const index = next++;
      try {
        results[index] = await work(values[index]!, index);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}
