import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { stepTurnEvent } from "./step-text.ts";

describe("stepTurnEvent", () => {
  it("turns a started step into its id and Spanish text", () => {
    assert.deepEqual(
      stepTurnEvent({
        status: "started",
        id: 3,
        step: { kind: "choose-products", original: "yerba" },
      }),
      { type: "step-started", id: 3, text: "Eligiendo productos para 'yerba'" },
    );
  });

  it("says it is understanding the Owner's message while route-message runs", () => {
    assert.deepEqual(
      stepTurnEvent({ status: "started", id: 1, step: { kind: "understand-message" } }),
      { type: "step-started", id: 1, text: "Entendiendo tu mensaje" },
    );
  });

  it("says it is planning while the plan task runs", () => {
    assert.deepEqual(stepTurnEvent({ status: "started", id: 2, step: { kind: "plan" } }), {
      type: "step-started",
      id: 2,
      text: "Armando el plan",
    });
  });

  it("names every query of a search round", () => {
    assert.deepEqual(
      stepTurnEvent({
        status: "started",
        id: 4,
        step: { kind: "search", queries: ["tapas lasaña", "carne picada"] },
      }),
      { type: "step-started", id: 4, text: "Buscando 'tapas lasaña', 'carne picada'" },
    );
  });

  it("turns a done step into its id and seconds", () => {
    assert.deepEqual(
      stepTurnEvent({
        status: "done",
        id: 3,
        step: { kind: "choose-products", original: "yerba" },
        durationMs: 1250,
      }),
      { type: "step-done", id: 3, seconds: 1.25 },
    );
  });
});
