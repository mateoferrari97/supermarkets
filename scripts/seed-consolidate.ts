import { existsSync, writeFileSync } from "node:fs";
import {
  consolidate,
  decisionsSchema,
  renderSummary,
} from "../src/product-type-seed/consolidate.ts";
import { proposalSchema, validateProposal } from "../src/product-type-seed/proposal.ts";
import { validateProductTypes } from "../src/product-types/validate.ts";
import {
  CARREFOUR_MAPPING_PATH,
  DECISIONS_PATH,
  DOUBTS_PATH,
  PROPOSALS_DIR,
  SUMMARY_PATH,
  VOCABULARY_PATH,
  readJson,
  readParts,
  writeJsonText,
} from "./seed-files.ts";

function fail(errors: string[]): never {
  for (const error of errors) console.error(error);
  process.exit(1);
}

const partial = process.argv.includes("--partial");
const parts = readParts();
if (parts.length === 0) fail(["No parts found. Run pnpm seed:split first."]);

const missing: string[] = [];
const proposals = parts.flatMap((part) => {
  const path = `${PROPOSALS_DIR}/${part.id}.json`;
  if (!existsSync(path)) {
    missing.push(part.id);
    return [];
  }
  const input = readJson(path);
  const errors = validateProposal(input, part);
  if (errors.length > 0)
    fail([`Proposal for ${part.id} is invalid; run pnpm seed:check-proposal ${part.id}`]);
  return [proposalSchema.parse(input)];
});

if (missing.length > 0 && !partial) {
  fail([
    `Parts without a proposal: ${missing.join(", ")}. Classify them, or pass --partial to write a partial tree.`,
  ]);
}

const decisions = existsSync(DECISIONS_PATH)
  ? decisionsSchema.safeParse(readJson(DECISIONS_PATH))
  : decisionsSchema.safeParse([]);
if (!decisions.success) {
  fail(
    decisions.error.issues.map(
      (issue) => `${DECISIONS_PATH} at "${issue.path.join(".")}": ${issue.message}`,
    ),
  );
}

const result = consolidate(parts, proposals, decisions.data);
if (!result.ok) fail(result.errors);
const { consolidation, warnings } = result;
for (const warning of warnings) console.warn(`warning: ${warning}`);

const validation = validateProductTypes(consolidation.vocabulary, consolidation.mapping);
if (validation.length > 0) fail(validation);

writeFileSync(VOCABULARY_PATH, writeJsonText(consolidation.vocabulary));
writeFileSync(CARREFOUR_MAPPING_PATH, writeJsonText(consolidation.mapping));
writeFileSync(DOUBTS_PATH, writeJsonText(consolidation.doubts));
writeFileSync(SUMMARY_PATH, renderSummary(consolidation));

const productTypes = consolidation.vocabulary.groups.reduce(
  (total, group) => total + group.productTypes.length,
  0,
);
console.log(
  `Consolidated ${proposals.length} of ${parts.length} parts: ${consolidation.vocabulary.groups.length} Groups, ${productTypes} Product Types, ${consolidation.excluded.length} excluded, ${consolidation.doubts.length} doubts`,
);
if (missing.length > 0) console.log(`Parts without a proposal: ${missing.join(", ")}`);
console.log(`Wrote ${VOCABULARY_PATH}, ${CARREFOUR_MAPPING_PATH}, ${DOUBTS_PATH}, ${SUMMARY_PATH}`);
