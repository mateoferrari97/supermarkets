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
