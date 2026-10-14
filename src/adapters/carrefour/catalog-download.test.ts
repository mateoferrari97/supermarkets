import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { summarizeTipos, type CatalogProduct } from "./catalog-download.ts";

const product = (
  name: string,
  tipo: string | null,
  availableQuantity: number,
  familia = "Infusiones",
): CatalogProduct => ({
  productId: name,
  skuIds: [name],
  ean: null,
  name,
  brand: null,
  category: null,
  department: "Almacén",
  price: null,
  listPrice: null,
  availableQuantity,
  sector: null,
  seccion: "Almacén",
  grupo: null,
  familia,
  subfamilia: null,
  tipo,
  measureUnit: "GRM",
  consumptionQuantity: null,
  conversionFactor: null,
  unitPrice: null,
});

describe("summarizeTipos", () => {
  it("counts each Tipo's products, puts available examples first and sorts by size", () => {
    const summaries = summarizeTipos([
      product("Té negro", "Té", 1),
      product("Yerba sin stock", "Yerba", 0, "Yerbas"),
      product("Yerba 1 kg", "Yerba", 3, "Yerbas"),
      product("Yerba 500 g", "Yerba", 2),
      product("Sin tipo", null, 1),
    ]);
    assert.deepEqual(summaries, [
      {
        tipo: "Yerba",
        products: 3,
        availableProducts: 2,
        secciones: { Almacén: 3 },
        familias: { Yerbas: 2, Infusiones: 1 },
        measureUnits: { GRM: 3 },
        examples: ["Yerba 1 kg", "Yerba 500 g", "Yerba sin stock"],
      },
      {
        tipo: "Té",
        products: 1,
        availableProducts: 1,
        secciones: { Almacén: 1 },
        familias: { Infusiones: 1 },
        measureUnits: { GRM: 1 },
        examples: ["Té negro"],
      },
    ]);
  });
});
