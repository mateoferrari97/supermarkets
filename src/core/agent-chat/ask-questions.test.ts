import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { product, memoryOrders } from "./agent-chat-fixtures.ts";
import { askQuestions } from "./ask-questions.ts";
import type { ChatOrder } from "./order.ts";
import type { TurnOutcome } from "./tool.ts";

const waiting = (): ChatOrder => ({
  id: "order-1",
  status: "draft",
  openedAt: "2026-10-16T12:00:00.000Z",
  items: [
    {
      kind: "choose",
      ref: "1",
      description: "yogur",
      brand: null,
      size: "common",
      quantity: "minimum",
      alternatives: [
        product("11", "Yogur frutilla Ilolay", 500),
        product("12", "Yogur vainilla Ilolay", 520),
        product("13", "Yogur durazno Ilolay", 540),
      ],
      shown: ["11", "12", "13"],
    },
    {
      kind: "choose",
      ref: "2",
      description: "galletitas",
      brand: null,
      size: "common",
      quantity: "minimum",
      alternatives: [product("21", "Galletitas dulces Terrabusi", 900)],
      shown: ["21"],
    },
  ],
  proposals: 0,
  proposal: null,
});

const setup = () => {
  const memory = memoryOrders([waiting()]);
  const outcome: TurnOutcome = { ended: null };
  return { dependencies: { orders: memory.orders, outcome }, outcome, current: memory.current };
};

describe("askQuestions", () => {
  it("records every question of the turn as one numbered round and ends the turn", async () => {
    const { dependencies, outcome, current } = setup();
    const output = await askQuestions(
      {
        questions: [
          {
            ref: "1",
            text: "¿Qué yogur querés?",
            options: [{ productId: "11" }, { productId: "12" }, { label: "Otro" }],
            recommended: 2,
          },
          {
            ref: "2",
            text: "¿Estas galletitas?",
            options: [{ productId: "21" }],
            recommended: 1,
          },
          {
            text: "¿Para cuándo?",
            options: [{ label: "Hoy" }, { label: "Mañana" }],
            recommended: 1,
          },
        ],
      },
      dependencies,
    );
    assert.deepEqual(output, { kind: "asked", questions: 3 });
    const part = outcome.ended?.parts[0];
    assert.equal(part?.type, "round");
    if (part?.type === "round") {
      assert.deepEqual(
        part.round.questions.map((question) => [question.number, question.ref]),
        [
          [1, "1"],
          [2, "2"],
          [3, null],
        ],
      );
      assert.deepEqual(part.round.questions[0]?.options, [
        { label: "Yogur frutilla Ilolay", productId: "11", price: 500 },
        { label: "Yogur vainilla Ilolay", productId: "12", price: 520 },
        { label: "Otro", productId: null, price: null },
      ]);
      assert.equal(part.round.questions[0]?.recommended, 2);
    }
    const text = outcome.ended?.text ?? "";
    assert.match(text, /1\. ¿Qué yogur querés\?/);
    assert.match(text, /b\) Yogur vainilla Ilolay \(\$520\.00\) — recomendada/);
    assert.match(text, /3\. ¿Para cuándo\?/);
    assert.deepEqual(current(), [waiting()]);
  });

  it("refuses a second round in the same turn", async () => {
    const { dependencies, outcome } = setup();
    const question = {
      text: "¿Hoy?",
      options: [{ label: "Sí" }, { label: "No" }],
      recommended: 1,
    };
    await askQuestions({ questions: [question] }, dependencies);
    const first = outcome.ended;
    const second = await askQuestions(
      { questions: [{ ...question, text: "¿Otra?" }] },
      dependencies,
    );
    assert.deepEqual(second, { kind: "refused", reason: "round-already-asked", question: null });
    assert.equal(outcome.ended, first);
  });

  it("refuses an option that is not one of the Alternatives of the ref", async () => {
    const { dependencies, outcome } = setup();
    const output = await askQuestions(
      {
        questions: [{ ref: "1", text: "¿Cuál?", options: [{ productId: "21" }], recommended: 1 }],
      },
      dependencies,
    );
    assert.deepEqual(output, { kind: "refused", reason: "not-an-alternative", question: 1 });
    assert.equal(outcome.ended, null);
  });

  it("refuses a product option with no ref and an unknown ref", async () => {
    const { dependencies, outcome } = setup();
    assert.deepEqual(
      await askQuestions(
        { questions: [{ text: "¿Cuál?", options: [{ productId: "11" }], recommended: 1 }] },
        dependencies,
      ),
      { kind: "refused", reason: "not-an-alternative", question: 1 },
    );
    assert.deepEqual(
      await askQuestions(
        {
          questions: [{ ref: "9", text: "¿Cuál?", options: [{ label: "A" }], recommended: 1 }],
        },
        dependencies,
      ),
      { kind: "refused", reason: "unknown-ref", question: 1 },
    );
    assert.equal(outcome.ended, null);
  });

  it("refuses an option with both a product and a label or with neither", async () => {
    const { dependencies } = setup();
    const ask = (option: { productId?: string; label?: string }) =>
      askQuestions(
        { questions: [{ ref: "1", text: "¿Cuál?", options: [option], recommended: 1 }] },
        dependencies,
      );
    assert.deepEqual(await ask({ productId: "11", label: "x" }), {
      kind: "refused",
      reason: "bad-option",
      question: 1,
    });
    assert.deepEqual(await ask({}), { kind: "refused", reason: "bad-option", question: 1 });
  });

  it("refuses a recommended option that does not exist", async () => {
    const { dependencies, outcome } = setup();
    for (const recommended of [0, 3]) {
      const output = await askQuestions(
        {
          questions: [{ text: "¿Hoy?", options: [{ label: "Sí" }, { label: "No" }], recommended }],
        },
        dependencies,
      );
      assert.deepEqual(output, { kind: "refused", reason: "bad-recommended", question: 1 });
    }
    assert.equal(outcome.ended, null);
  });
});
