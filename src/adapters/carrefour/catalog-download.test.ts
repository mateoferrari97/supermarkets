import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { catalogProductsFrom, summarizeTipos, type CatalogProduct } from "./catalog-download.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));

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
  measurementUnit: "un",
  unitMultiplier: 1,
  teasers: [],
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

describe("catalogProductsFrom", () => {
  const [coca, banana, chips] = catalogProductsFrom(
    fixture("catalog-search-coca-cola-banana.json"),
    "Almacén",
  );

  it("keeps the measurement unit, unit multiplier and teasers of the first item", () => {
    assert.deepEqual(
      [coca, banana, chips].map((product) => ({
        name: product?.name,
        measurementUnit: product?.measurementUnit,
        unitMultiplier: product?.unitMultiplier,
        teasers: product?.teasers,
      })),
      [
        {
          name: "Gaseosa cola Coca Cola sabor original 2,25 lts",
          measurementUnit: "un",
          unitMultiplier: 1,
          teasers: [
            {
              name: "PROMO-2do al 50% Max 48 unidades Combinable COCA COLA-Reg-2-50-Aniv2 9 al 15.10",
              minimumQuantity: 2,
            },
          ],
        },
        {
          name: "Banana selección x kg.",
          measurementUnit: "kg",
          unitMultiplier: 0.5,
          teasers: [],
        },
        { name: "Chips de banana 100 g.", measurementUnit: "un", unitMultiplier: 1, teasers: [] },
      ],
    );
  });

  it("keeps the price, stock, department, tipo and measure of seller 1", () => {
    assert.deepEqual(
      {
        productId: coca?.productId,
        skuIds: coca?.skuIds,
        price: coca?.price,
        department: coca?.department,
        tipo: coca?.tipo,
        measureUnit: coca?.measureUnit,
        consumptionQuantity: coca?.consumptionQuantity,
        inStock: (coca?.availableQuantity ?? 0) > 0,
      },
      {
        productId: "30138",
        skuIds: ["3807"],
        price: 6000,
        department: "Almacén",
        tipo: "Gaseosa",
        measureUnit: "CM3",
        consumptionQuantity: "2250.00",
        inStock: true,
      },
    );
  });
});
