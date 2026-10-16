import type { Reply, Turn } from "../order-conversation/take-turn.ts";
import type { OnStep, Step } from "../order-conversation/steps.ts";
import type { OnlineStore } from "../product-selection/online-store.ts";

export type LlmCallRecord = {
  task: string;
  model: string;
  effort: string | null;
  systemPromptSha256: string;
  input: unknown;
  rawOutput: string;
  costUsd: number;
  durationMs: number;
};

export type AssistantReply = Reply | { kind: "error"; message: string };

export type TurnOutcome = "completed" | "failed" | "aborted";

export type StoreMethod = keyof OnlineStore;

export type ConversationEvent =
  | { type: "conversation-started"; sessionId: string; commit: string | null }
  | { type: "owner-message"; text: string }
  | { type: "step-started"; step: Step }
  | { type: "step-done"; step: Step; durationMs: number }
  | ({ type: "llm-call" } & LlmCallRecord)
  | {
      type: "store-call";
      method: StoreMethod;
      input: unknown;
      output: unknown;
      error: string | null;
      durationMs: number;
    }
  | { type: "assistant-reply"; reply: AssistantReply }
  | { type: "turn-ended"; outcome: TurnOutcome; error: string | null; durationMs: number };

export type WriteConversationEvent = (event: ConversationEvent) => void;

export type Clock = () => number;

const monotonic: Clock = () => performance.now();

export function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

export function loggedStore(
  store: OnlineStore,
  write: WriteConversationEvent,
  now: Clock = monotonic,
): OnlineStore {
  const recorded = async <I, O>(
    method: StoreMethod,
    input: I,
    call: () => Promise<O>,
  ): Promise<O> => {
    const started = now();
    try {
      const output = await call();
      write({
        type: "store-call",
        method,
        input,
        output,
        error: null,
        durationMs: now() - started,
      });
      return output;
    } catch (error) {
      write({
        type: "store-call",
        method,
        input,
        output: null,
        error: messageOf(error),
        durationMs: now() - started,
      });
      throw error;
    }
  };
  return {
    checkDelivery: (postalCode, signal) =>
      recorded("checkDelivery", { postalCode }, () => store.checkDelivery(postalCode, signal)),
    simulate: (request, signal) =>
      recorded("simulate", request, () => store.simulate(request, signal)),
    cartLink: (items) => {
      const started = now();
      const output = store.cartLink(items);
      write({
        type: "store-call",
        method: "cartLink",
        input: { items },
        output,
        error: null,
        durationMs: now() - started,
      });
      return output;
    },
  };
}

export function loggedSteps(write: WriteConversationEvent, now: Clock = monotonic): OnStep {
  const running = new Map<string, number[]>();
  return ({ status, step }) => {
    const key = JSON.stringify(step);
    const queue = running.get(key) ?? [];
    running.set(key, queue);
    if (status === "started") {
      queue.push(now());
      write({ type: "step-started", step });
      return;
    }
    const started = queue.shift();
    write({ type: "step-done", step, durationMs: started === undefined ? 0 : now() - started });
  };
}

export async function loggedTurn(
  write: WriteConversationEvent,
  text: string,
  signal: AbortSignal,
  take: () => Promise<Turn>,
  now: Clock = monotonic,
): Promise<Turn> {
  const started = now();
  write({ type: "owner-message", text });
  try {
    const turn = await take();
    write({ type: "assistant-reply", reply: turn.reply });
    write({ type: "turn-ended", outcome: "completed", error: null, durationMs: now() - started });
    return turn;
  } catch (error) {
    const message = messageOf(error);
    if (signal.aborted) {
      write({
        type: "turn-ended",
        outcome: "aborted",
        error: message,
        durationMs: now() - started,
      });
    } else {
      write({ type: "assistant-reply", reply: { kind: "error", message } });
      write({ type: "turn-ended", outcome: "failed", error: message, durationMs: now() - started });
    }
    throw error;
  }
}
