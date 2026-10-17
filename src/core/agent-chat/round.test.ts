import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { chatMessageSchema } from "./chat.ts";
import { renderRound, roundSchema, type Round } from "./round.ts";

const round: Round = {
  questions: [
    {
      number: 1,
      ref: "1",
      text: "¿Qué yogur querés?",
      options: [
        { label: "Yogur frutilla Ilolay", productId: "11", price: 500 },
        { label: "Otro", productId: null, price: null },
      ],
      recommended: 1,
    },
    {
      number: 2,
      ref: null,
      text: "¿Para cuándo?",
      options: [{ label: "Hoy", productId: null, price: null }],
      recommended: 1,
    },
  ],
};

describe("renderRound", () => {
  it("numbers the questions, letters the options and marks the recommended one", () => {
    assert.equal(
      renderRound(round),
      [
        "Necesito que me confirmes algunas cosas:",
        "1. ¿Qué yogur querés?",
        "   a) Yogur frutilla Ilolay ($500.00) — recomendada",
        "   b) Otro",
        "2. ¿Para cuándo?",
        "   a) Hoy — recomendada",
        "Respondé con la letra de cada pregunta o aceptá las recomendadas.",
      ].join("\n"),
    );
  });
});

describe("a round as a message part", () => {
  it("is a valid part of an Assistant message", () => {
    const parsed = chatMessageSchema.safeParse({
      role: "assistant",
      at: "2026-10-16T12:00:00.000Z",
      text: renderRound(round),
      parts: [{ type: "round", round }],
    });
    assert.ok(parsed.success);
  });

  it("rejects a recommended option that is not among the options and an empty round", () => {
    const bad = structuredClone(round);
    bad.questions[1]!.recommended = 2;
    assert.equal(roundSchema.safeParse(bad).success, false);
    assert.equal(roundSchema.safeParse({ questions: [] }).success, false);
  });
});
