import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { stepsFrom, type StepEvent } from "./steps.ts";

const deferred = () => {
  const resolvers: (() => void)[] = [];
  const promise = new Promise<void>((done) => resolvers.push(done));
  return { promise, resolve: () => resolvers.forEach((done) => done()) };
};

const settable = () => {
  const clock = { time: 0, now: () => clock.time };
  return clock;
};

describe("stepsFrom", () => {
  it("gives a started step a new id and its done event the same id and duration", async () => {
    const clock = settable();
    const events: StepEvent[] = [];
    const steps = stepsFrom({ onStep: (event) => events.push(event), now: clock.now });

    await steps.run({ kind: "understand-order" }, () => {
      clock.time = 1500;
      return Promise.resolve();
    });
    await steps.run({ kind: "simulate-cart" }, () => {
      clock.time = 1750;
      return Promise.resolve();
    });

    assert.deepEqual(events, [
      { status: "started", id: 1, step: { kind: "understand-order" } },
      { status: "done", id: 1, step: { kind: "understand-order" }, durationMs: 1500 },
      { status: "started", id: 2, step: { kind: "simulate-cart" } },
      { status: "done", id: 2, step: { kind: "simulate-cart" }, durationMs: 250 },
    ]);
  });

  it("gives two parallel steps of the same kind each its own id and duration", async () => {
    const clock = settable();
    const events: StepEvent[] = [];
    const steps = stepsFrom({ onStep: (event) => events.push(event), now: clock.now });
    const step = { kind: "choose-products", original: "yerba" } as const;
    const firstWork = deferred();
    const secondWork = deferred();

    const first = steps.run(step, () => firstWork.promise);
    clock.time = 100;
    const second = steps.run(step, () => secondWork.promise);
    clock.time = 400;
    secondWork.resolve();
    await second;
    clock.time = 1000;
    firstWork.resolve();
    await first;

    assert.deepEqual(events, [
      { status: "started", id: 1, step },
      { status: "started", id: 2, step },
      { status: "done", id: 2, step, durationMs: 300 },
      { status: "done", id: 1, step, durationMs: 1000 },
    ]);
  });

  it("reports no done event when the work fails", async () => {
    const events: StepEvent[] = [];
    const steps = stepsFrom({ onStep: (event) => events.push(event), now: () => 0 });

    await assert.rejects(
      steps.run({ kind: "simulate-cart" }, () =>
        Promise.reject(new Error("Carrefour answered 500")),
      ),
      /500/,
    );

    assert.deepEqual(events, [{ status: "started", id: 1, step: { kind: "simulate-cart" } }]);
  });
});
