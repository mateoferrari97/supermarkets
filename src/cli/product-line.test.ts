import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "../core/order-matching/catalog-product.ts";
import { productLine } from "./product-line.ts";

const product: CatalogProduct = {
  productId: "123",
  itemId: "1230",
  name: "Gaseosa cola Coca Cola sabor original 2,25 lts",
  brand: "Coca-Cola",
  department: "Bebidas",
  tipo: "Gaseosas cola",
  price: 3200,
  inStock: true,
  sale: { kind: "packaged", size: { dimension: "volume", amount: 2250 } },
  teasers: [],
};

describe("productLine", () => {
  it("shows the id, name, brand, size, price and stock", () => {
    assert.equal(
      productLine(product),
      "123 | Gaseosa cola Coca Cola sabor original 2,25 lts | Coca-Cola | 2250 ml | $3200 | in stock",
    );
  });

  it("shows a product sold by weight and missing fields", () => {
    assert.equal(
      productLine({
        ...product,
        brand: null,
        price: null,
        inStock: false,
        sale: { kind: "by-weight", saleStepKg: 0.5 },
      }),
      "123 | Gaseosa cola Coca Cola sabor original 2,25 lts | no brand | by weight, step 0.5 kg | no price | out of stock",
    );
    assert.match(
      productLine({ ...product, sale: { kind: "packaged", size: null } }),
      /\| no size \|/,
    );
  });
});
