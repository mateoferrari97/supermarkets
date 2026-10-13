import { existsSync, readFileSync } from "node:fs";
import { validateProposal } from "../src/product-type-seed/proposal.ts";
import type { Part } from "../src/product-type-seed/split.ts";

const PARTS_DIR = ".data/carrefour/seed/parts";
const PROPOSALS_DIR = ".data/carrefour/seed/proposals";

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

const part = JSON.parse(readFileSync(partPath, "utf8")) as Part;
const errors = validateProposal(JSON.parse(readFileSync(proposalPath, "utf8")), part);

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log(`Proposal for ${partId} is valid: ${part.tipos.length} Tipos placed`);
