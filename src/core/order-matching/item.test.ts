import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { parseQuantity, parseSize } from "./item.ts";

describe("parseSize", () => {
  it.each([
    ["common", { kind: "common" }],
    ["biggest", { kind: "biggest" }],
    ["smallest", { kind: "smallest" }],
    ["500 ml", { kind: "exact", dimension: "volume", amount: 500 }],
    ["2.25 l", { kind: "exact", dimension: "volume", amount: 2250 }],
    ["1.1 l", { kind: "exact", dimension: "volume", amount: 1100 }],
    ["1 l", { kind: "exact", dimension: "volume", amount: 1000 }],
    ["300 g", { kind: "exact", dimension: "weight", amount: 300 }],
    ["1.5 kg", { kind: "exact", dimension: "weight", amount: 1500 }],
    ["0.5 kg", { kind: "exact", dimension: "weight", amount: 500 }],
  ])("reads %j", (text, size) => {
    assert.deepEqual(parseSize(text), size);
  });

  it.each([
    "",
    "grande",
    "2,25 l",
    "2.25l",
    "2.25 lts",
    "2 unit",
    "0 ml",
    "0.0 kg",
    "-1 l",
    ".5 l",
    "1 l ",
    "Common",
  ])("rejects %j", (text) => {
    assert.equal(parseSize(text), null);
  });
});

describe("parseQuantity", () => {
  it.each([
    ["minimum", { kind: "minimum" }],
    ["1 unit", { kind: "units", count: 1 }],
    ["12 unit", { kind: "units", count: 12 }],
    ["300 g", { kind: "weight", grams: 300 }],
    ["2 kg", { kind: "weight", grams: 2000 }],
    ["1.5 kg", { kind: "weight", grams: 1500 }],
    ["0.25 kg", { kind: "weight", grams: 250 }],
  ])("reads %j", (text, quantity) => {
    assert.deepEqual(parseQuantity(text), quantity);
  });

  it.each(["", "2", "2 units", "1.5 unit", "0 unit", "2 l", "500 ml", "0 kg", "1,5 kg", "common"])(
    "rejects %j",
    (text) => {
      assert.equal(parseQuantity(text), null);
    },
  );
});
