import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { productMatchesBrand, sameBrand } from "./catalog.ts";

describe("sameBrand", () => {
  it("matches a brand written with one letter wrong, missing or extra", () => {
    assert.ok(sameBrand("la diviza", "La Divisa"));
    assert.ok(sameBrand("Playadito", "Playadit"));
    assert.ok(sameBrand("Sancor", "SanCor"));
  });

  it("does not match short brands or brands two letters apart", () => {
    assert.ok(!sameBrand("Ades", "Adis"));
    assert.ok(!sameBrand("la diviza", "La Visita"));
  });
});

describe("productMatchesBrand", () => {
  it("matches a product by a misspelt brand", () => {
    const chorizo = { name: "Chorizo puro de cerdo La Divisa 400 grs", brand: "La Divisa" };
    assert.ok(productMatchesBrand(chorizo, "la diviza"));
    assert.ok(!productMatchesBrand(chorizo, "Paladini"));
  });
});
