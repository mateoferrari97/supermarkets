import type { FitProductsInput, FitProductsOutput } from "./match-items.ts";

export type Llm = {
  fitProducts(input: FitProductsInput, signal: AbortSignal): Promise<FitProductsOutput>;
};
