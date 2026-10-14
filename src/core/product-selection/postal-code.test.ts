import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { postalCodeFrom } from "./postal-code.ts";

describe("postalCodeFrom", () => {
  it("takes the four digits of what the Owner wrote", () => {
    assert.equal(postalCodeFrom("1425"), "1425");
    assert.equal(postalCodeFrom("CP 1425"), "1425");
    assert.equal(postalCodeFrom("C1425ABC"), "1425");
  });

  it("finds no postal code in text without four digits", () => {
    assert.equal(postalCodeFrom("por casa"), null);
    assert.equal(postalCodeFrom("142"), null);
  });
});
