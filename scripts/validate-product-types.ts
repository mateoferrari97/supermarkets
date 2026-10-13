import { readFileSync } from "node:fs";
import { validateProductTypes } from "../src/product-types/validate.ts";

const VOCABULARY_PATH = "vocabulary/product-types.json";
const CARREFOUR_MAPPING_PATH = "vocabulary/carrefour-tipos.json";

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

const errors = validateProductTypes(readJson(VOCABULARY_PATH), readJson(CARREFOUR_MAPPING_PATH));

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log("Product Type vocabulary and Carrefour mapping are valid");
