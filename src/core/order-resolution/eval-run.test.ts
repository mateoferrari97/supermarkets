import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { runEvalCase } from "./eval-run.ts";
import type { EvalCase } from "./eval-set.ts";
import type { OrderItem, OrderResolution } from "./resolve-order.ts";

const vocabulary = {
  groups: [{ id: "grupo-yerba", name: "Yerba", productTypes: [{ id: "yerba", name: "Yerba" }] }],
};

const evalCase: EvalCase = {
  id: "yerba",
  order: "una yerba",
  items: [{ productType: "yerba" }],
};

const resolvedTo = (id: string): OrderItem => ({
  phrase: "yerba",
  quantity: null,
  brand: null,
  terms: [],
  vagueWords: [],
  productTypes: [{ id, name: id }],
  question: null,
});

const resolution = (items: OrderItem[]): OrderResolution => ({
  paymentCard: null,
  preference: null,
  items,
  message: null,
});

describe("runEvalCase", () => {
  it("resolves the case's order text", async () => {
    const asked: string[] = [];
    await runEvalCase(
      evalCase,
      (orderText) => {
        asked.push(orderText);
        return Promise.resolve(resolution([resolvedTo("yerba")]));
      },
      vocabulary,
    );
    assert.deepEqual(asked, ["una yerba"]);
  });

  it("is a hit when the resolution meets every expectation", async () => {
    const items = [resolvedTo("yerba")];
    const result = await runEvalCase(
      evalCase,
      () => Promise.resolve(resolution(items)),
      vocabulary,
    );
    assert.deepEqual(result, { outcome: "hit", problems: [], error: null, items });
  });

  it("is a miss with the problems when the resolution differs", async () => {
    const items = [resolvedTo("mate")];
    const result = await runEvalCase(
      evalCase,
      () => Promise.resolve(resolution(items)),
      vocabulary,
    );
    assert.deepEqual(result, {
      outcome: "miss",
      problems: ["no Item matches Product Type yerba"],
      error: null,
      items,
    });
  });

  it("is an error with the message when resolving throws", async () => {
    const result = await runEvalCase(
      evalCase,
      () => Promise.reject(new Error("Claude Code session failed")),
      vocabulary,
    );
    assert.deepEqual(result, {
      outcome: "error",
      problems: [],
      error: "Claude Code session failed",
      items: [],
    });
  });
});
