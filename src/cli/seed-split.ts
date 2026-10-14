import { loadCatalog, saveParts } from "../compose.ts";
import { splitIntoParts } from "../core/product-type-seed/split.ts";
import { valueOf } from "./report.ts";

const parts = splitIntoParts(valueOf(loadCatalog()));

saveParts(parts);
for (const part of parts) console.log(`${part.id}: ${part.tipos.length} Tipos`);
console.log(
  `${parts.reduce((total, part) => total + part.tipos.length, 0)} Tipos in ${parts.length} parts`,
);
