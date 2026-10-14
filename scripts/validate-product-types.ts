import { validateProductTypes } from "../src/core/product-types/validate.ts";
import { CARREFOUR_MAPPING_PATH, VOCABULARY_PATH, readJson } from "./seed-files.ts";

const errors = validateProductTypes(readJson(VOCABULARY_PATH), readJson(CARREFOUR_MAPPING_PATH));

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log("Product Type vocabulary and Carrefour mapping are valid");
