import { validateEvalSet } from "../src/core/order-resolution/eval-set.ts";
import { readJson } from "./seed-files.ts";
import { ORDER_EVAL_SET_PATH, readVocabulary } from "./order-files.ts";

const errors = validateEvalSet(readJson(ORDER_EVAL_SET_PATH), readVocabulary());

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log("Order resolution eval set is valid");
