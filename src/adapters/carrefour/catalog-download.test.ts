import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { catalogProductsFrom } from "./catalog-download.ts";

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, "fixtures", name), "utf8"));

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
