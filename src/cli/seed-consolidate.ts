import {
  hasProposal,
  loadDecisions,
  loadParts,
  loadProposal,
  saveConsolidation,
} from "../compose.ts";
import { consolidate } from "../core/product-type-seed/consolidate.ts";
import { validateProductTypes } from "../core/product-types/validate.ts";
import { fail, valueOf } from "./report.ts";

const partial = process.argv.includes("--partial");
const parts = loadParts();
if (parts.length === 0) fail(["No parts found. Run pnpm seed:split first."]);

const missing: string[] = [];
const proposals = parts.flatMap((part) => {
  if (!hasProposal(part.id)) {
    missing.push(part.id);
    return [];
  }
  const proposal = loadProposal(part);
  if (!proposal.ok)
    fail([`Proposal for ${part.id} is invalid; run pnpm seed:check-proposal ${part.id}`]);
  return [proposal.value];
});

if (missing.length > 0 && !partial) {
  fail([
    `Parts without a proposal: ${missing.join(", ")}. Classify them, or pass --partial to write a partial tree.`,
  ]);
}

const decisions = valueOf(loadDecisions());

const result = consolidate(parts, proposals, decisions);
if (!result.ok) fail(result.errors);
const { consolidation, warnings } = result;
for (const warning of warnings) console.warn(`warning: ${warning}`);

const validation = validateProductTypes(consolidation.vocabulary, consolidation.mapping);
if (validation.length > 0) fail(validation);

const written = saveConsolidation(consolidation);

const productTypes = consolidation.vocabulary.groups.reduce(
  (total, group) => total + group.productTypes.length,
  0,
);
console.log(
  `Consolidated ${proposals.length} of ${parts.length} parts: ${consolidation.vocabulary.groups.length} Groups, ${productTypes} Product Types, ${consolidation.excluded.length} excluded, ${consolidation.doubts.length} doubts`,
);
if (missing.length > 0) console.log(`Parts without a proposal: ${missing.join(", ")}`);
console.log(`Wrote ${written.join(", ")}`);
