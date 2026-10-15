export type Step =
  | { kind: "understand-order" }
  | { kind: "understand-answer" }
  | { kind: "choose-products"; original: string }
  | { kind: "simulate-cart" };

export type StepEvent = { status: "started" | "done"; step: Step };

export type OnStep = (event: StepEvent) => void;

export type StepOptions = { signal?: AbortSignal; onStep?: OnStep };

export type Steps = {
  signal: AbortSignal;
  run: <T>(step: Step, work: () => Promise<T>) => Promise<T>;
};

export function stepsFrom({ signal, onStep }: StepOptions = {}): Steps {
  return {
    signal: signal ?? new AbortController().signal,
    run: async (step, work) => {
      onStep?.({ status: "started", step });
      const result = await work();
      onStep?.({ status: "done", step });
      return result;
    },
  };
}
