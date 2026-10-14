import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { paymentCardTableSchema } from "../src/core/product-selection/payment-cards.ts";
import { PAYMENT_CARDS_PATH } from "./order-files.ts";
import { readJson } from "./seed-files.ts";

describe("payment card table", () => {
  it("parses the committed table", () => {
    assert.equal(paymentCardTableSchema.safeParse(readJson(PAYMENT_CARDS_PATH)).success, true);
  });
});
