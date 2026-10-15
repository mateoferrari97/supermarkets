import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { buildWordSimilarityIndex, trigramSimilarity, trigrams } from "./word-similarity.ts";

describe("trigrams", () => {
  it("pads a word like pg_trgm", () => {
    assert.deepEqual([...trigrams("cat")], ["  c", " ca", "cat", "at "]);
  });
});

describe("trigramSimilarity", () => {
  it.each([
    ["salut", "salut", 1],
    ["picana", "picanha", 0.5],
    ["picana", "picante", 0.5],
    ["abc", "xyz", 0],
  ])("%s to %s is %d", (a, b, similarity) => {
    assert.equal(trigramSimilarity(a, b), similarity);
  });
});

describe("buildWordSimilarityIndex", () => {
  it("averages each query word's best match over the query words", () => {
    const index = buildWordSimilarityIndex(["Queso Port Salut", "Queso cremoso", "Leche"]);
    const scores = index.scores("queso salut");
    assert.equal(scores.get(0), 1);
    assert.equal(scores.get(1), 0.5);
    assert.equal(scores.has(2), false);
  });

  it("ignores accents and case", () => {
    const index = buildWordSimilarityIndex(["Carbón de LEÑA"]);
    assert.equal(index.scores("carbon de lena").get(0), 1);
  });
});
