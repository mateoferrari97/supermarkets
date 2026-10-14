import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { splitIntoParts } from "../src/core/product-type-seed/split.ts";
import { PARTS_DIR, readCatalogProducts } from "./seed-files.ts";

const parts = splitIntoParts(readCatalogProducts());

rmSync(PARTS_DIR, { recursive: true, force: true });
mkdirSync(PARTS_DIR, { recursive: true });
for (const part of parts) {
  writeFileSync(join(PARTS_DIR, `${part.id}.json`), JSON.stringify(part, null, 2));
  console.log(`${part.id}: ${part.tipos.length} Tipos`);
}
console.log(
  `${parts.reduce((total, part) => total + part.tipos.length, 0)} Tipos in ${parts.length} parts`,
);
