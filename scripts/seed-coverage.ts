import { existsSync } from "node:fs";
import { tipoMappingSchema } from "../src/core/product-types/schema.ts";
import { coverage, renderCoverage } from "../src/core/product-type-seed/coverage.ts";
import { splitIntoParts } from "../src/core/product-type-seed/split.ts";
import {
  CARREFOUR_MAPPING_PATH,
  DOUBTS_PATH,
  readCatalogProducts,
  readJson,
} from "./seed-files.ts";

const groceryTipos = splitIntoParts(readCatalogProducts()).flatMap((part) =>
  part.tipos.map(({ tipo }) => tipo),
);
const mapping = tipoMappingSchema.parse(readJson(CARREFOUR_MAPPING_PATH));
const doubtTipos = existsSync(DOUBTS_PATH)
  ? (readJson(DOUBTS_PATH) as { tipo: string }[]).map(({ tipo }) => tipo)
  : [];

console.log(renderCoverage(coverage(groceryTipos, mapping, doubtTipos)));
