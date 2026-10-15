import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "./catalog-product.ts";
import {
  answerCaseSchema,
  answerCasePassed,
  replyInputOf,
  scoreAnswer,
  unexpectedAnswerFailures,
  type AnswerCase,
} from "./eval-answers.ts";
import { staleIds, validateEvalSet } from "./eval-set.ts";
import type { Item } from "./item.ts";
import type { ReadReplyOutput } from "./read-reply.ts";

const orderCase = {
  id: "yerba",
  order: "una yerba",
  items: [{ product: "Yerba", brand: null, size: "common", quantity: "minimum", fits: ["1"] }],
};

const answerCase = (fields: Record<string, unknown> = {}) => ({
  id: "la-2",
  items: [
    { original: "carbón en bolsa", question: "¿Te sirve alguno?", alternatives: ["1", "2"] },
    { original: "coca zero", bought: "3" },
  ],
  reply: "el carbón la 2",
  entries: [{ item: 1, kind: "choice", alternative: 2 }],
  newLines: [],
  ...fields,
});

const parsed = (fields: Record<string, unknown> = {}): AnswerCase =>
  answerCaseSchema.parse(answerCase(fields));

const line = (product: string, brand: string | null = null): Item => ({
  original: product,
  product,
  brand,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
});

const output = (fields: Partial<ReadReplyOutput> = {}): ReadReplyOutput => ({
  entries: [{ item: 1, kind: "choice", alternative: 2 }],
  newLines: [],
  ignoredPreference: false,
  ...fields,
});

const product = (productId: string): CatalogProduct => ({
  productId,
  itemId: `i${productId}`,
  name: `Producto ${productId}`,
  brand: null,
  department: "Almacén",
  tipo: null,
  price: 100,
  inStock: true,
  sale: { kind: "packaged", size: null },
  teasers: [],
});

describe("answer cases in the eval set", () => {
  const validate = (...answers: unknown[]) => validateEvalSet({ cases: [orderCase], answers }, []);

  it("accepts valid answer cases", () => {
    assert.deepEqual(
      validate(
        answerCase(),
        answerCase({
          id: "patagonia",
          reply: "dale, una Patagonia, y sacá la coca. pago con Visa",
          entries: [
            { item: 1, kind: "lines", lines: [{ product: "Cerveza", brand: "Patagonia" }] },
            { item: 2, kind: "drop" },
          ],
          newLines: [{ product: "Vino tinto", brand: null }],
          ignoredPreference: true,
          expectedToFail: "reason",
        }),
      ),
      [],
    );
  });

  it("reports wrong entries and ids used twice", () => {
    assert.deepEqual(
      validate(
        answerCase({
          id: "yerba",
          items: [
            { original: "carbón", question: "¿Cuál?", alternatives: ["1", "1"] },
            { original: "coca", bought: "3" },
            { original: "queso", question: "¿Cuál?", alternatives: ["4"] },
          ],
          entries: [
            { item: 1, kind: "choice", alternative: 3 },
            { item: 1, kind: "drop" },
            { item: 2, kind: "choice", alternative: 1 },
            { item: 4, kind: "drop" },
          ],
        }),
        answerCase({ id: "coca", entries: [{ item: 2, kind: "drop" }] }),
      ),
      [
        'answer case "yerba" id is used more than once',
        'answer case "yerba" entry for item 1 chooses alternative 3, which it lacks',
        'answer case "yerba" entry for item 1 is repeated',
        'answer case "yerba" entry for item 2 chooses for an Item in the cart',
        'answer case "yerba" entry for item 4 is outside its items',
        'answer case "yerba" item 1 repeats 1',
        'answer case "yerba" asked item 3 has no expected entry',
        'answer case "coca" asked item 1 has no expected entry',
      ],
    );
  });

  it("reports schema errors with their path", () => {
    assert.deepEqual(validate(answerCase({ reply: "" })), [
      "eval set answers.0.reply: Too small: expected string to have >=1 characters",
    ]);
  });

  it("reports stale Alternatives and products bought", () => {
    const evalSet = { cases: [], answers: [parsed()] };
    assert.deepEqual(
      staleIds(
        evalSet,
        new Map([
          ["1", true],
          ["2", false],
        ]),
      ),
      [
        { caseId: "la-2", productId: "2", reason: "out of stock" },
        { caseId: "la-2", productId: "3", reason: "missing" },
      ],
    );
  });
});

describe("replyInputOf", () => {
  it("builds the read-reply input from the Catalog Snapshot products", () => {
    assert.deepEqual(replyInputOf(parsed(), product), {
      items: [
        {
          kind: "asked",
          original: "carbón en bolsa",
          question: { text: "¿Te sirve alguno?", alternatives: [product("1"), product("2")] },
        },
        { kind: "bought", original: "coca zero", product: product("3") },
      ],
      reply: "el carbón la 2",
    });
  });

  it("fails when a product is not in the Catalog Snapshot", () => {
    assert.throws(
      () => replyInputOf(parsed(), (id) => (id === "2" ? undefined : product(id))),
      /product 2 is not in the Catalog Snapshot/,
    );
  });
});

describe("scoreAnswer", () => {
  it("passes when every entry, the new lines and ignoredPreference match", () => {
    assert.deepEqual(scoreAnswer(parsed(), output()), { passed: true, problems: [] });
  });

  it("compares lines by the words of the product and the brand, ignoring case and accents", () => {
    const expected = parsed({
      entries: [{ item: 1, kind: "lines", lines: [{ product: "Carbón", brand: "Patagonia" }] }],
      newLines: [{ product: "vino tinto", brand: null }],
    });
    const got = output({
      entries: [{ item: 1, kind: "lines", lines: [line("Carbon vegetal", "patagonia")] }],
      newLines: [line("Vino tinto")],
    });
    assert.deepEqual(scoreAnswer(expected, got), { passed: true, problems: [] });
  });

  it("lists every difference", () => {
    const expected = parsed({
      entries: [{ item: 1, kind: "lines", lines: [{ product: "Cerveza", brand: "Patagonia" }] }],
      newLines: [{ product: "Vino tinto", brand: null }],
      ignoredPreference: true,
    });
    const got = output({
      entries: [
        { item: 1, kind: "lines", lines: [line("Cerveza", "Quilmes")] },
        { item: 2, kind: "drop" },
      ],
    });
    assert.deepEqual(scoreAnswer(expected, got).problems, [
      "item 1 expects lines Cerveza (Patagonia), got lines Cerveza (Quilmes)",
      "item 2 expects no entry, got drop",
      "newLines expect Vino tinto (no brand), got none",
      "ignoredPreference expects true",
    ]);
  });

  it("fails a wrong Alternative and a missing entry", () => {
    const expected = parsed({
      entries: [
        { item: 1, kind: "choice", alternative: 2 },
        { item: 2, kind: "drop" },
      ],
    });
    assert.deepEqual(
      scoreAnswer(expected, output({ entries: [{ item: 1, kind: "choice", alternative: 1 }] }))
        .problems,
      ["item 1 expects choice 2, got choice 1", "item 2 expects drop, got no entry"],
    );
  });
});

describe("answerCasePassed", () => {
  const passing = { error: null, output: output(), score: { passed: true, problems: [] } };

  it("passes only when every run passes", () => {
    const answerCase = parsed();
    assert.equal(answerCasePassed({ answerCase, runs: [passing, passing] }), true);
    assert.equal(answerCasePassed({ answerCase, runs: [passing, { error: "timeout" }] }), false);
    assert.equal(answerCasePassed({ answerCase, runs: [] }), false);
  });

  it("counts a failure as unexpected only without expectedToFail", () => {
    const failing = [{ error: "timeout" }];
    assert.deepEqual(
      unexpectedAnswerFailures([
        { answerCase: parsed(), runs: failing },
        { answerCase: parsed({ id: "known", expectedToFail: "reason" }), runs: failing },
      ]),
      ["la-2"],
    );
  });
});
