import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { packageSize } from "./catalog-product.ts";

describe("packageSize", () => {
  it.each([
    ["CM3", "1500", { dimension: "volume", amount: 1500 }],
    ["LTR", "1.00", { dimension: "volume", amount: 1000 }],
    ["ML", "250.00", { dimension: "volume", amount: 250 }],
    ["GRM", "500.00", { dimension: "weight", amount: 500 }],
    ["KGM", "1.5", { dimension: "weight", amount: 1500 }],
    ["UNI", "12", { dimension: "units", amount: 12 }],
    ["MTR", "30", { dimension: "length", amount: 30 }],
  ])("reads %s %s", (measureUnit, consumptionQuantity, size) => {
    assert.deepEqual(packageSize(measureUnit, consumptionQuantity), size);
  });

  it.each([
    [null, null],
    ["GRM", null],
    [null, "500"],
    ["M21", "18"],
    ["UNI,UNI", "1.00,1.00"],
    ["GRM", "0"],
  ])("gives no size for %s %s", (measureUnit, consumptionQuantity) => {
    assert.equal(packageSize(measureUnit, consumptionQuantity), null);
  });
});
