import { existsSync } from "node:fs";
import { validateProposal } from "../src/product-type-seed/proposal.ts";
import type { Part } from "../src/product-type-seed/split.ts";
import { PARTS_DIR, PROPOSALS_DIR, readJson } from "./seed-files.ts";

const partId = process.argv[2];
if (!partId) {
  console.error("Usage: pnpm seed:check-proposal <part-id>");
  process.exit(1);
}

const partPath = `${PARTS_DIR}/${partId}.json`;
const proposalPath = `${PROPOSALS_DIR}/${partId}.json`;
for (const path of [partPath, proposalPath]) {
  if (!existsSync(path)) {
    console.error(`Missing ${path}`);
    process.exit(1);
  }
}

const part = readJson(partPath) as Part;
const errors = validateProposal(readJson(proposalPath), part);

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log(`Proposal for ${partId} is valid: ${part.tipos.length} Tipos placed`);
