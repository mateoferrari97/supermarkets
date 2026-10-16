import assert from "node:assert/strict";
import { describe, it } from "vitest";
import type { CatalogProduct } from "./catalog-product.ts";
import type { Item } from "./item.ts";
import {
  checkedReadReply,
  checkReadReply,
  type ReadReplyInput,
  type ReadReplyOutput,
  type ReplyEntry,
} from "./read-reply.ts";

const product = (name: string): CatalogProduct => ({
  productId: name,
  itemId: name,
  name,
  brand: null,
  department: "Bebidas",
  tipo: null,
  price: 1000,
  inStock: true,
  sale: { kind: "packaged", size: null },
  teasers: [],
});

const wine: Item = {
  original: "un vino tinto",
  product: "Vino tinto",
  brand: null,
  size: { kind: "common" },
  quantity: { kind: "minimum" },
};

const input: ReadReplyInput = {
  items: [
    {
      kind: "asked",
      original: "cerveza artesanal de tamarindo",
      question: {
        text: "No encontré cerveza de tamarindo. ¿Te sirve alguna?",
        alternatives: [product("Cerveza ipa 473 ml"), product("Cerveza roja 730 cc")],
      },
    },
    { kind: "bought", original: "coca cola zero grande", product: product("Coca Cola Zero") },
    {
      kind: "asked",
      original: "1 bolsa de carbon",
      question: { text: "¿Te sirve este?", alternatives: [product("Carbón vegetal 4 kg")] },
    },
  ],
  reply: "la 2, y sacá el carbón",
};

const answer = (entries: ReplyEntry[], newLines: Item[] = []): ReadReplyOutput => ({
  entries,
  newLines,
  ignoredPreference: false,
});

describe("checkReadReply", () => {
  it("returns an answer with an entry for every asked Item as it is, in Item order", () => {
    const output = answer(
      [
        { item: 3, kind: "drop" },
        { item: 1, kind: "choice", alternative: 2 },
        { item: 2, kind: "unanswered", question: "¿Cuál coca, la zero o la normal?" },
      ],
      [wine],
    );
    assert.deepEqual(checkReadReply(input, output), {
      entries: [
        { item: 1, kind: "choice", alternative: 2 },
        { item: 2, kind: "unanswered", question: "¿Cuál coca, la zero o la normal?" },
        { item: 3, kind: "drop" },
      ],
      newLines: [wine],
      ignoredPreference: false,
    });
  });

  it("adds an unanswered entry for every asked Item left out, in Item order", () => {
    assert.deepEqual(
      checkReadReply(input, answer([{ item: 2, kind: "lines", lines: [wine] }])).entries,
      [
        { item: 1, kind: "unanswered", question: null },
        { item: 2, kind: "lines", lines: [wine] },
        { item: 3, kind: "unanswered", question: null },
      ],
    );
  });

  it("adds no entry for an Item in the cart left out", () => {
    assert.deepEqual(
      checkReadReply(
        input,
        answer([
          { item: 1, kind: "drop" },
          { item: 3, kind: "drop" },
        ]),
      ).entries,
      [
        { item: 1, kind: "drop" },
        { item: 3, kind: "drop" },
      ],
    );
  });

  it.each<[string, ReplyEntry[], string]>([
    [
      "an Item outside the list",
      [{ item: 4, kind: "drop" }],
      "Item 4 breaks a rule: an entry only for one of its 3 listed Items",
    ],
    [
      "two entries for one Item",
      [
        { item: 1, kind: "drop" },
        { item: 1, kind: "choice", alternative: 1 },
      ],
      'Item 1 ("cerveza artesanal de tamarindo") breaks a rule: one entry per Item',
    ],
    [
      "a choice for an Item in the cart",
      [{ item: 2, kind: "choice", alternative: 1 }],
      'Item 2 ("coca cola zero grande") breaks a rule: a choice only for an asked Item',
    ],
    [
      "an Alternative outside the question",
      [{ item: 1, kind: "choice", alternative: 3 }],
      'Item 1 ("cerveza artesanal de tamarindo") breaks a rule: a choice within its 2 Alternatives, not 3',
    ],
    [
      "an Alternative of zero",
      [{ item: 3, kind: "choice", alternative: 0 }],
      'Item 3 ("1 bolsa de carbon") breaks a rule: a choice within its 1 Alternatives, not 0',
    ],
    [
      "an unanswered Item in the cart without a question",
      [{ item: 2, kind: "unanswered", question: null }],
      'Item 2 ("coca cola zero grande") breaks a rule: a question on an unanswered Item in the cart',
    ],
  ])("fails on %s, naming the task, the Item and the rule", (_case, entries, problem) => {
    assert.throws(() => checkReadReply(input, answer(entries)), {
      message: `read-reply answer for ${problem}`,
    });
  });
});

describe("checkedReadReply", () => {
  it("asks the LLM with the input and signal it gets and checks its answer", async () => {
    const signal = new AbortController().signal;
    const seen: [ReadReplyInput, AbortSignal][] = [];
    const llm = {
      readReply: (given: ReadReplyInput, givenSignal: AbortSignal) => {
        seen.push([given, givenSignal]);
        return Promise.resolve(answer([{ item: 3, kind: "drop" }]));
      },
    };
    assert.deepEqual((await checkedReadReply(llm, input, signal)).entries, [
      { item: 1, kind: "unanswered", question: null },
      { item: 3, kind: "drop" },
    ]);
    assert.deepEqual(seen, [[input, signal]]);
  });

  it("fails on an answer of a fake LLM that breaks a rule", async () => {
    const llm = {
      readReply: () => Promise.resolve(answer([{ item: 2, kind: "choice", alternative: 1 }])),
    };
    await assert.rejects(
      checkedReadReply(llm, input, new AbortController().signal),
      /read-reply answer for Item 2 \("coca cola zero grande"\) breaks a rule/,
    );
  });
});
