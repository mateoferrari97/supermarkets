import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { RemainingDoubt } from "./consolidate.ts";
import { doubtBatch, renderDoubtBatch } from "./doubts.ts";

const doubt = (tipo: string, products: number): RemainingDoubt => ({
  tipo,
  part: "lacteos",
  products,
  examples: [`${tipo} ejemplo`],
  candidates: [{ id: "leche-entera", name: "Leche entera", group: "Leche" }, "excluded"],
  reason: "Mezcla",
});

describe("doubtBatch", () => {
  it("takes the doubts with most products first, then by Tipo", () => {
    const batch = doubtBatch(
      [doubt("Leches", 4), doubt("Bebida láctea", 38), doubt("Alimento", 4)],
      2,
    );
    assert.deepEqual(
      batch.map(({ tipo }) => tipo),
      ["Bebida láctea", "Alimento"],
    );
  });
});

describe("renderDoubtBatch", () => {
  it("numbers doubts and letters their ranked candidates", () => {
    assert.equal(
      renderDoubtBatch([doubt("Leches", 4)], 3),
      [
        "1 of 3 remaining doubts",
        "",
        "1. Leches (4 products, part lacteos)",
        "   Reason: Mezcla",
        "   - Leches ejemplo",
        "   a) Leche entera `leche-entera` (Group Leche)",
        "   b) exclude",
        "",
      ].join("\n"),
    );
  });
});
