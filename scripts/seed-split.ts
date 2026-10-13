import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { splitIntoParts } from "../src/product-type-seed/split.ts";

const CATALOG_PATH = ".data/carrefour/products.json";
const PARTS_DIR = ".data/carrefour/seed/parts";

const catalogSchema = z.object({
  products: z.array(
    z.object({
      name: z.string(),
      department: z.string(),
      availableQuantity: z.number(),
      seccion: z.string().nullable(),
      familia: z.string().nullable(),
      tipo: z.string().nullable(),
      measureUnit: z.string().nullable(),
    }),
  ),
});

if (!existsSync(CATALOG_PATH)) {
  console.error(`No Catalog Snapshot at ${CATALOG_PATH}. Run pnpm carrefour:catalog first.`);
  process.exit(1);
}

const catalog = catalogSchema.parse(JSON.parse(readFileSync(CATALOG_PATH, "utf8")));
const parts = splitIntoParts(catalog.products);

rmSync(PARTS_DIR, { recursive: true, force: true });
mkdirSync(PARTS_DIR, { recursive: true });
for (const part of parts) {
  writeFileSync(join(PARTS_DIR, `${part.id}.json`), JSON.stringify(part, null, 2));
  console.log(`${part.id}: ${part.tipos.length} Tipos`);
}
console.log(
  `${parts.reduce((total, part) => total + part.tipos.length, 0)} Tipos in ${parts.length} parts`,
);
