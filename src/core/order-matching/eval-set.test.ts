import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { evalSetSchema, exampleOrders, staleIds, validateEvalSet } from "./eval-set.ts";

const item = (fields: Record<string, unknown> = {}) => ({
  product: "Yerba",
  brand: null,
  size: "common",
  quantity: "minimum",
  fits: ["1", "2"],
  ...fields,
});

const evalCase = (fields: Record<string, unknown> = {}) => ({
  id: "yerba",
  order: "una yerba",
  items: [item()],
  ...fields,
});

const setOf = (...cases: unknown[]) => ({ cases });

describe("validateEvalSet", () => {
  it("accepts a valid set", () => {
    assert.deepEqual(
      validateEvalSet(
        setOf(
          evalCase({
            notItems: ["huevo"],
            ignoredPreference: false,
            expectedToFail: "reason",
            items: [
              item({ brand: ["La Divisa", "La Diviza"], quantity: "2 unit", pick: ["2"] }),
              item({ fits: undefined, alternatives: ["3"], quantity: "300 g", size: "exact" }),
            ],
          }),
        ),
        [],
      ),
      [],
    );
  });

  it("reports schema errors with their path", () => {
    assert.deepEqual(validateEvalSet(setOf(evalCase({ items: [item({ fits: [] })] })), []), [
      "eval set cases.0.items.0.fits: Too small: expected array to have >=1 items",
    ]);
    assert.deepEqual(
      validateEvalSet(setOf(evalCase({ items: [item({ quantity: "2 units" })] })), []),
      ['eval set cases.0.items.0.quantity: expected "minimum", "<n> unit" or "<amount> <g|kg>"'],
    );
    assert.deepEqual(validateEvalSet(setOf(evalCase({ tipo: "Yerba" })), []), [
      'eval set cases.0: Unrecognized key: "tipo"',
    ]);
  });

  it("reports repeated case ids", () => {
    assert.deepEqual(validateEvalSet(setOf(evalCase(), evalCase()), []), [
      'eval case "yerba" id is used more than once',
    ]);
  });

  it("checks fits, pick and alternatives of each Item", () => {
    assert.deepEqual(
      validateEvalSet(
        setOf(
          evalCase({
            items: [
              item({ fits: ["1", "1", "2"], pick: ["3"] }),
              item({ fits: undefined }),
              item({ alternatives: ["4"] }),
              item({ fits: undefined, alternatives: ["4"], pick: ["4"] }),
            ],
          }),
        ),
        [],
      ),
      [
        'eval case "yerba" item 1 picks 3, which is not among its fits',
        'eval case "yerba" item 1 repeats 1',
        'eval case "yerba" item 2 has to have either fits or alternatives',
        'eval case "yerba" item 3 has to have either fits or alternatives',
        'eval case "yerba" item 4 has a pick without fits',
        'eval case "yerba" item 4 picks 4, which is not among its fits',
      ],
    );
  });

  it("rejects an order equal to an example order of the prompts", () => {
    const examples = exampleOrders("# Examples\n\n<order>\nUna  Yerba\n</order>\n\n{}");
    assert.deepEqual(examples, ["una yerba"]);
    assert.deepEqual(validateEvalSet(setOf(evalCase()), examples), [
      'eval case "yerba" order is an example order of the prompts',
    ]);
    assert.deepEqual(validateEvalSet(setOf(evalCase({ order: "una yerba y sal" })), examples), []);
  });
});

describe("staleIds", () => {
  it("reports expected products missing from the snapshot or out of stock, once per case", () => {
    const evalSet = evalSetSchema.parse(
      setOf(
        evalCase({
          items: [item({ fits: ["1", "2", "3"] }), item({ fits: undefined, alternatives: ["2"] })],
        }),
      ),
    );
    assert.deepEqual(
      staleIds(
        evalSet,
        new Map([
          ["1", true],
          ["2", false],
        ]),
      ),
      [
        { caseId: "yerba", productId: "2", reason: "out of stock" },
        { caseId: "yerba", productId: "3", reason: "missing" },
      ],
    );
  });
});
