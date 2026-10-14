import { existsSync } from "node:fs";
import type { RemainingDoubt } from "../src/core/product-type-seed/consolidate.ts";
import { doubtBatch, renderDoubtBatch } from "../src/core/product-type-seed/doubts.ts";
import { DOUBTS_PATH, readJson } from "./seed-files.ts";

const DEFAULT_BATCH_SIZE = 10;

if (!existsSync(DOUBTS_PATH)) {
  console.error(`No ${DOUBTS_PATH}. Run pnpm seed:consolidate first.`);
  process.exit(1);
}

const sizeArgument = process.argv[2];
const size = sizeArgument ? Number(sizeArgument) : DEFAULT_BATCH_SIZE;
if (!Number.isInteger(size) || size < 1) {
  console.error("Usage: pnpm seed:doubts [batch size]");
  process.exit(1);
}

const doubts = readJson(DOUBTS_PATH) as RemainingDoubt[];
if (doubts.length === 0) {
  console.log("No remaining doubts");
} else {
  console.log(renderDoubtBatch(doubtBatch(doubts, size), doubts.length));
}
