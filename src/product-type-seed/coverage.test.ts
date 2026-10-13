import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coverage, renderCoverage } from "./coverage.ts";

describe("coverage", () => {
  it("counts a Tipo as mapped when the mapping has it, even if the doubts file still lists it", () => {
    const result = coverage(["Leches"], { Leches: "leche-entera" }, ["Leches"]);
    assert.equal(result.mapped, 1);
    assert.equal(result.inDoubt, 0);
  });

  it("counts mapped, excluded, in doubt and unreviewed Tipos against the Catalog Snapshot", () => {
    const result = coverage(
      ["Leche entera", "Leches", "Leche balsámica", "Leche en polvo entera", "Cacao"],
      {
        "Leche entera": "leche-entera",
        Leches: "leche-entera",
        "Leche balsámica": null,
        Yerba: "yerba",
      },
      ["Leche en polvo entera"],
    );
    assert.deepEqual(result, {
      grocery: 5,
      mapped: 2,
      excluded: 1,
      inDoubt: 1,
      unreviewed: ["Cacao"],
      notInSnapshot: ["Yerba"],
    });
    assert.equal(
      renderCoverage(result),
      [
        "Grocery Tipos in the Catalog Snapshot: 5",
        "Mapped: 2",
        "Excluded: 1",
        "In doubt: 1",
        "Unreviewed: 1",
        "In the mapping but not in the Catalog Snapshot: 1",
      ].join("\n"),
    );
  });
});
