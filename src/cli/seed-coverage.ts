import { loadCatalog, loadDoubts, loadProductTypes } from "../compose.ts";
import { coverage, renderCoverage } from "../core/product-type-seed/coverage.ts";
import { splitIntoParts } from "../core/product-type-seed/split.ts";
import { valueOf } from "./report.ts";

const groceryTipos = splitIntoParts(valueOf(loadCatalog())).flatMap((part) =>
  part.tipos.map(({ tipo }) => tipo),
);
const { mapping } = valueOf(loadProductTypes());
const doubts = loadDoubts();
const doubtTipos = doubts.ok ? doubts.value.map(({ tipo }) => tipo) : [];

console.log(renderCoverage(coverage(groceryTipos, mapping, doubtTipos)));
