import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { z } from "zod";
import { ITEM_LINE_CASES } from "../../core/order-matching/item-line-cases.ts";
import { parseLine, QUANTITY_PATTERN, SIZE_PATTERN } from "../../core/order-matching/item.ts";
import { lineSchema } from "./llm-output-schemas.ts";

describe("lineSchema", () => {
  it.each(ITEM_LINE_CASES)(
    "accepts size $size and quantity $quantity exactly when the Item parser does",
    ({ size, quantity }) => {
      const line = { original: "coca", product: "coca", brand: null, size, quantity };
      assert.equal(lineSchema.safeParse(line).success, parseLine(line).ok);
    },
  );

  it("sends the Item patterns to Claude Code", () => {
    const { properties } = z.toJSONSchema(lineSchema) as {
      properties: Record<string, { pattern?: string }>;
    };
    assert.equal(properties.size?.pattern, SIZE_PATTERN.source);
    assert.equal(properties.quantity?.pattern, QUANTITY_PATTERN.source);
  });
});
