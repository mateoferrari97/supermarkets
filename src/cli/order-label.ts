import { createCatalogSearch } from "../compose.ts";
import { fail, valueOf } from "./report.ts";
import { productLine } from "./product-line.ts";

const LABEL_LIMIT = 50;

const args = process.argv.slice(2);
const brandFlag = args.indexOf("--brand");
const brand = brandFlag === -1 ? null : (args[brandFlag + 1] ?? null);
const words = args.filter(
  (_, index) => brandFlag === -1 || (index !== brandFlag && index !== brandFlag + 1),
);
if (words.length === 0 || (brandFlag !== -1 && brand === null)) {
  fail(["Usage: pnpm order:label <words> [--brand <brand>]"]);
}

const search = valueOf(createCatalogSearch());
const product = words.join(" ");
for (const [index, match] of search.findMatches({ product, brand }, LABEL_LIMIT).entries()) {
  console.log(`${String(index + 1)}. ${productLine(match)}`);
}
