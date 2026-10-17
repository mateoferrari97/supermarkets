export type Step = { kind: "choose-products"; original: string };

export const stepLabel = (step: Step): string => `Eligiendo productos para '${step.original}'`;

export type StepEvent =
  | { status: "started"; id: number; step: Step }
  | { status: "done"; id: number; step: Step; durationMs: number };

export type OnStep = (event: StepEvent) => void;

export type StepClock = () => number;

export type StepOptions = { signal?: AbortSignal; onStep?: OnStep; now?: StepClock };

export type Steps = {
  signal: AbortSignal;
  run: <T>(step: Step, work: () => Promise<T>) => Promise<T>;
};

const monotonic: StepClock = () => performance.now();

export function stepsFrom({ signal, onStep, now = monotonic }: StepOptions = {}): Steps {
  let lastId = 0;
  return {
    signal: signal ?? new AbortController().signal,
    run: async (step, work) => {
      const id = ++lastId;
      const startedAt = now();
      onStep?.({ status: "started", id, step });
      const result = await work();
      onStep?.({ status: "done", id, step, durationMs: now() - startedAt });
      return result;
    },
  };
}
