import { EXCLUDED_CANDIDATE } from "./proposal.ts";
import type { RemainingDoubt } from "./consolidate.ts";

export function doubtBatch(doubts: RemainingDoubt[], size: number): RemainingDoubt[] {
  return [...doubts]
    .sort((a, b) => b.products - a.products || a.tipo.localeCompare(b.tipo, "es"))
    .slice(0, size);
}

export function renderDoubtBatch(batch: RemainingDoubt[], remaining: number): string {
  const lines = [`${batch.length} of ${remaining} remaining doubts`, ""];
  batch.forEach((doubt, index) => {
    lines.push(`${index + 1}. ${doubt.tipo} (${doubt.products} products, part ${doubt.part})`);
    lines.push(`   Reason: ${doubt.reason}`);
    for (const example of doubt.examples) lines.push(`   - ${example}`);
    doubt.candidates.forEach((candidate, rank) => {
      const option = String.fromCharCode(97 + rank);
      lines.push(
        candidate === EXCLUDED_CANDIDATE
          ? `   ${option}) exclude`
          : `   ${option}) ${candidate.name} \`${candidate.id}\` (Group ${candidate.group})`,
      );
    });
    lines.push("");
  });
  return lines.join("\n");
}
