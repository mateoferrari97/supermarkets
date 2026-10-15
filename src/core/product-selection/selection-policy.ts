import { compareItemIds, type Candidate } from "./candidates.ts";

export type SimulatedCandidate = { candidate: Candidate; total: number; savings: number };

export function rankBySelectionPolicy(simulated: SimulatedCandidate[]): SimulatedCandidate[] {
  return [...simulated].sort(
    (a, b) =>
      Number(b.savings > 0) - Number(a.savings > 0) ||
      pricePerUnit(a) - pricePerUnit(b) ||
      compareItemIds(a.candidate.product.itemId, b.candidate.product.itemId),
  );
}

function pricePerUnit({ candidate, total }: SimulatedCandidate): number {
  return total / candidate.measured;
}
