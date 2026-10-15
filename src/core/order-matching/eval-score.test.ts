import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { evalCaseSchema, expectedItemSchema, type EvalCase } from "./eval-set.ts";
import {
  casePassed,
  changesSince,
  pairItems,
  scoreRun,
  stability,
  summarize,
  unexpectedFailures,
  unexpectedPasses,
  type CaseRuns,
  type ItemRun,
  type OrderRun,
  type ScoredRun,
} from "./eval-score.ts";
import type { Item } from "./item.ts";

const allLive = () => true;

const caseOf = (fields: Record<string, unknown>): EvalCase =>
  evalCaseSchema.parse({ id: "case", order: "un pedido", ...fields });

const expected = (fields: Record<string, unknown> = {}) => ({
  product: "Coca Cola",
  brand: "Coca-Cola",
  size: "biggest",
  quantity: "2 unit",
  fits: ["coca-354", "coca-2250", "coca-1500"],
  pick: ["coca-2250"],
  ...fields,
});

const parsedItem = (fields: Partial<Item> = {}): Item => ({
  original: "dos cocas grandes",
  product: "Gaseosa cola",
  brand: "Coca Cola",
  size: { kind: "biggest" },
  quantity: { kind: "units", count: 2 },
  ...fields,
});

const itemRun = (fields: Partial<ItemRun> = {}): ItemRun => ({
  item: parsedItem(),
  matches: ["coca-354", "coca-2250", "pepsi-2250", "coca-1500"],
  fits: ["coca-354", "coca-2250", "pepsi-2250"],
  alternatives: [],
  note: null,
  question: null,
  pick: { productId: "coca-2250", quantity: 2, notes: [] },
  ...fields,
});

const orderRun = (items: ItemRun[], ignoredPreference = false): OrderRun => ({
  items,
  ignoredPreference,
});

const scored = (evalCase: EvalCase, run: OrderRun, isLive = allLive): ScoredRun => ({
  error: null,
  result: run,
  score: scoreRun(evalCase, run, isLive),
});

describe("scoreRun", () => {
  it("scores a right pick with the recall and precision of Matches and Fits", () => {
    const score = scoreRun(caseOf({ items: [expected()] }), orderRun([itemRun()]), allLive);
    assert.equal(score.passed, true);
    assert.deepEqual(score.problems, []);
    const [item] = score.items;
    assert.equal(item?.readRight, true);
    assert.equal(item?.pickRight, true);
    assert.deepEqual(item?.matchesRecall, { hits: 3, total: 3 });
    assert.deepEqual(item?.fitsPrecision, { hits: 2, total: 3 });
    assert.deepEqual(item?.fitsRecall, { hits: 2, total: 3 });
    assert.equal(item?.wrongPickUnseen, false);
  });

  it("accepts any Fit when no pick is given", () => {
    const evalCase = caseOf({ items: [expected({ pick: undefined })] });
    const run = orderRun([itemRun({ pick: { productId: "coca-354", quantity: 2, notes: [] } })]);
    assert.equal(scoreRun(evalCase, run, allLive).passed, true);
  });

  it("counts a wrong pick with no Note and no question as one nobody sees", () => {
    const evalCase = caseOf({ items: [expected()] });
    const wrong = { productId: "pepsi-2250", quantity: 2, notes: [] };
    const unseen = scoreRun(evalCase, orderRun([itemRun({ pick: wrong })]), allLive);
    assert.equal(unseen.passed, false);
    assert.equal(unseen.items[0]?.wrongPickUnseen, true);
    assert.deepEqual(unseen.problems, ["Coca Cola: picked pepsi-2250"]);

    const withNote = scoreRun(
      evalCase,
      orderRun([itemRun({ pick: wrong, note: "Tomé Pepsi" })]),
      allLive,
    );
    assert.equal(withNote.items[0]?.wrongPickUnseen, false);
    const withCodeNote = scoreRun(
      evalCase,
      orderRun([itemRun({ pick: { ...wrong, notes: ["No hay de 3 l; llevo 2,25 l"] } })]),
      allLive,
    );
    assert.equal(withCodeNote.items[0]?.wrongPickUnseen, false);
  });

  it("passes an Item that must ask only when it asks, and scores its Alternatives", () => {
    const evalCase = caseOf({
      items: [expected({ fits: undefined, pick: undefined, alternatives: ["a", "b"] })],
    });
    const asked = scoreRun(
      evalCase,
      orderRun([itemRun({ fits: [], pick: null, question: "¿Cuál?", alternatives: ["a", "c"] })]),
      allLive,
    );
    assert.equal(asked.passed, true);
    assert.deepEqual(asked.items[0]?.alternatives, { hits: 1, total: 2 });
    assert.equal(asked.items[0]?.pickRight, null);

    const picked = scoreRun(evalCase, orderRun([itemRun()]), allLive);
    assert.equal(picked.passed, false);
    assert.equal(picked.items[0]?.wrongPickUnseen, true);
    assert.deepEqual(picked.items[0]?.fitsPrecision, { hits: 0, total: 3 });
    assert.deepEqual(picked.problems, ["Coca Cola: did not ask"]);
  });

  it("fails an Item that asks when it should pick", () => {
    const score = scoreRun(
      caseOf({ items: [expected()] }),
      orderRun([itemRun({ fits: [], pick: null, question: "¿Cuál coca?" })]),
      allLive,
    );
    assert.equal(score.passed, false);
    assert.equal(score.items[0]?.asked, true);
    assert.equal(score.items[0]?.wrongPickUnseen, false);
    assert.deepEqual(score.problems, ['Coca Cola: asked "¿Cuál coca?"']);
  });

  it("checks how the Item was read without comparing the product text", () => {
    const score = scoreRun(
      caseOf({ items: [expected({ brand: ["La Divisa", "La Diviza"] })] }),
      orderRun([
        itemRun({
          item: parsedItem({
            product: "otra cosa",
            brand: "la diviza",
            size: { kind: "common" },
            quantity: { kind: "minimum" },
          }),
        }),
      ]),
      allLive,
    );
    assert.equal(score.items[0]?.readRight, false);
    assert.deepEqual(score.problems, [
      "Coca Cola: size common",
      'Coca Cola: quantity {"kind":"minimum"}',
    ]);
    assert.equal(score.passed, true);
  });

  it("matches brands without case, accents, spaces or hyphens", () => {
    const score = scoreRun(
      caseOf({ items: [expected({ brand: "La Serenísima" })] }),
      orderRun([itemRun({ item: parsedItem({ brand: "la serenisima" }) })]),
      allLive,
    );
    assert.equal(score.items[0]?.readRight, true);
    const noBrand = scoreRun(
      caseOf({ items: [expected({ brand: null })] }),
      orderRun([itemRun()]),
      allLive,
    );
    assert.equal(noBrand.items[0]?.readRight, false);
  });

  it("reports the number of Items, words that became Items and ignoredPreference", () => {
    const evalCase = caseOf({
      notItems: ["huevo"],
      ignoredPreference: true,
      items: [expected()],
    });
    const huevos = itemRun({
      item: parsedItem({ product: "Huevos" }),
      matches: [],
      fits: ["h1"],
      pick: { productId: "h1", quantity: 1, notes: [] },
    });
    const score = scoreRun(evalCase, orderRun([itemRun(), huevos], false), allLive);
    assert.equal(score.itemCountRight, false);
    assert.deepEqual(score.notItemsFound, ["huevo"]);
    assert.equal(score.ignoredPreferenceRight, false);
    assert.deepEqual(score.problems, [
      "expected 1 Items, got 2",
      '"huevo" became an Item',
      "expected ignoredPreference true",
    ]);
    assert.equal(score.passed, true);
  });

  it("fails an expected Item nothing came back for", () => {
    const score = scoreRun(caseOf({ items: [expected()] }), orderRun([]), allLive);
    assert.equal(score.passed, false);
    assert.deepEqual(score.problems, [
      "expected 1 Items, got 0",
      "Coca Cola: no Item came back for it",
    ]);
  });

  it("leaves stale ids out and does not fail an Item whose ids are all stale", () => {
    const isLive = (id: string) => id !== "coca-2250";
    const score = scoreRun(
      caseOf({ items: [expected()] }),
      orderRun([itemRun({ pick: { productId: "pepsi-2250", quantity: 2, notes: [] } })]),
      isLive,
    );
    assert.equal(score.items[0]?.stale, true);
    assert.equal(score.items[0]?.pickRight, null);
    assert.equal(score.passed, true);
    assert.deepEqual(score.items[0]?.fitsRecall, { hits: 1, total: 2 });

    const someStale = scoreRun(
      caseOf({ items: [expected({ pick: undefined })] }),
      orderRun([itemRun({ pick: { productId: "coca-354", quantity: 2, notes: [] } })]),
      isLive,
    );
    assert.equal(someStale.items[0]?.stale, false);
    assert.equal(someStale.items[0]?.pickRight, true);
  });
});

describe("pairItems", () => {
  it("pairs each expected Item with the Item whose products overlap most", () => {
    const yerba = expectedItemSchema.parse(
      expected({ product: "Yerba", fits: ["y1"], pick: undefined }),
    );
    const coca = expectedItemSchema.parse(expected());
    const yerbaRun = itemRun({ matches: ["y1"], fits: ["y1"] });
    const cocaRun = itemRun();
    const extra = itemRun({ matches: [], fits: [] });
    assert.deepEqual(pairItems([yerba, coca], [cocaRun, extra, yerbaRun], allLive), [2, 0]);
    assert.deepEqual(pairItems([yerba, coca], [extra], allLive), [0, null]);
  });
});

describe("cases, stability and totals", () => {
  const evalCase = caseOf({ items: [expected()] });
  const right = orderRun([itemRun()]);
  const otherFits = orderRun([itemRun({ fits: ["coca-2250"] })]);

  it("passes a case only when every run passes", () => {
    const passing: CaseRuns = {
      evalCase,
      runs: [scored(evalCase, right), scored(evalCase, right)],
    };
    assert.equal(casePassed(passing), true);
    assert.equal(
      casePassed({ evalCase, runs: [scored(evalCase, right), { error: "timeout" }] }),
      false,
    );
    assert.equal(casePassed({ evalCase, runs: [] }), false);
  });

  it("counts an Item stable when its Fits and pick are the same in every run", () => {
    assert.deepEqual(
      stability({ evalCase, runs: [scored(evalCase, right), scored(evalCase, right)] }),
      { hits: 1, total: 1 },
    );
    assert.deepEqual(
      stability({ evalCase, runs: [scored(evalCase, right), scored(evalCase, otherFits)] }),
      { hits: 0, total: 1 },
    );
    assert.deepEqual(stability({ evalCase, runs: [scored(evalCase, right), { error: "x" }] }), {
      hits: 0,
      total: 1,
    });
  });

  it("adds every metric over the runs of every case", () => {
    const askCase = caseOf({
      id: "ask",
      ignoredPreference: true,
      items: [expected({ fits: undefined, pick: undefined, alternatives: ["a"] })],
    });
    const wrong = orderRun([
      itemRun({ pick: { productId: "pepsi-2250", quantity: 2, notes: [] } }),
    ]);
    const totals = summarize([
      { evalCase, runs: [scored(evalCase, right), scored(evalCase, wrong)] },
      { evalCase: askCase, runs: [scored(askCase, orderRun([itemRun()], true)), { error: "x" }] },
    ]);
    assert.deepEqual(totals, {
      cases: { hits: 0, total: 2 },
      failedCases: ["case", "ask"],
      runs: 4,
      errors: 1,
      itemsRead: { hits: 3, total: 3 },
      itemCountRight: { hits: 3, total: 3 },
      notItemsKept: { hits: 3, total: 3 },
      matchesRecall: { hits: 6, total: 6 },
      fitsPrecision: { hits: 4, total: 9 },
      fitsRecall: { hits: 4, total: 6 },
      pickRight: { hits: 1, total: 2 },
      wrongPicksUnseen: 2,
      unexpectedQuestions: 0,
      missedQuestions: 1,
      scoredItems: 3,
      alternatives: { hits: 0, total: 0 },
      ignoredPreference: { hits: 1, total: 1 },
      stability: { hits: 0, total: 2 },
    });
  });

  it("lists failures that count, unexpected passes and changes since the last run", () => {
    const expectedToFail = caseOf({ id: "known", expectedToFail: "why", items: [expected()] });
    const cases: CaseRuns[] = [
      { evalCase, runs: [{ error: "x" }] },
      { evalCase: expectedToFail, runs: [scored(expectedToFail, right)] },
    ];
    assert.deepEqual(unexpectedFailures(cases), ["case"]);
    assert.deepEqual(unexpectedPasses(cases), ["known"]);
    assert.deepEqual(
      unexpectedFailures([{ evalCase: expectedToFail, runs: [{ error: "x" }] }]),
      [],
    );
    assert.deepEqual(
      changesSince(
        [
          { id: "case", passed: true },
          { id: "known", passed: true },
          { id: "gone", passed: false },
        ],
        [
          { id: "case", passed: false },
          { id: "known", passed: true },
          { id: "new", passed: true },
        ],
      ),
      ["case passed → failed"],
    );
  });
});
