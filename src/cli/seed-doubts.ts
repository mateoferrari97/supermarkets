import { loadDoubts } from "../compose.ts";
import { doubtBatch, renderDoubtBatch } from "../core/product-type-seed/doubts.ts";
import { fail, valueOf } from "./report.ts";

const DEFAULT_BATCH_SIZE = 10;

const doubts = valueOf(loadDoubts());

const sizeArgument = process.argv[2];
const size = sizeArgument ? Number(sizeArgument) : DEFAULT_BATCH_SIZE;
if (!Number.isInteger(size) || size < 1) fail(["Usage: pnpm seed:doubts [batch size]"]);

if (doubts.length === 0) {
  console.log("No remaining doubts");
} else {
  console.log(renderDoubtBatch(doubtBatch(doubts, size), doubts.length));
}
