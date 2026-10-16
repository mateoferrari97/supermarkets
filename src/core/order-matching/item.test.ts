import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ITEM_LINE_CASES } from "./item-line-cases.ts";
import { parseLine, roundMeasure } from "./item.ts";

describe("parseLine", () => {
  it.each(ITEM_LINE_CASES)(
    "reads size $size and quantity $quantity",
    ({ size, quantity, parsed }) => {
      const line = { original: "coca 2.25", product: "coca", brand: "Coca-Cola", size, quantity };
      assert.deepEqual(
        parseLine(line),
        parsed
          ? {
              ok: true,
              item: { original: "coca 2.25", product: "coca", brand: "Coca-Cola", ...parsed },
            }
          : {
              ok: false,
              failure: `"coca 2.25" has size "${size}" and quantity "${quantity}"`,
            },
      );
    },
  );
});

describe("roundMeasure", () => {
  it.each([
    [1100.0000000000002, 1100],
    [333.3333333, 333.333],
    [0.0005, 0.001],
    [0.0004, 0],
  ])("rounds %d to %d", (amount, rounded) => {
    assert.equal(roundMeasure(amount), rounded);
  });
});
