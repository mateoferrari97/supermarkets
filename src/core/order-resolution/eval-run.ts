import type { Vocabulary } from "../product-types/schema.ts";
import { scoreCase, type EvalCase } from "./eval-set.ts";
import type { OrderItem, OrderResolution } from "./resolve-order.ts";

export type EvalOutcome = "hit" | "miss" | "error";

export type EvalCaseResult = {
  outcome: EvalOutcome;
  problems: string[];
  error: string | null;
  items: OrderItem[];
};

export type EvalCaseRun = EvalCaseResult & {
  id: string;
  order: string;
  expectedToFail: string | null;
  sessions: number;
  durationMs: number;
  costUsd: number;
};

export type EvalRun = {
  startedAt: string;
  model: string;
  filters: string[];
  durationMs: number;
  costUsd: number;
  sessions: number;
  cases: EvalCaseRun[];
};

export async function runEvalCase(
  evalCase: EvalCase,
  resolveOrder: (orderText: string) => Promise<OrderResolution>,
  vocabulary: Vocabulary,
): Promise<EvalCaseResult> {
  try {
    const resolution = await resolveOrder(evalCase.order);
    const { hit, problems } = scoreCase(evalCase, resolution, vocabulary);
    return { outcome: hit ? "hit" : "miss", problems, error: null, items: resolution.items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { outcome: "error", problems: [], error: message, items: [] };
  }
}
