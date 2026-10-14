import { z } from "zod";
import type { StepEvent } from "../../../core/order-conversation/steps.ts";
import { takeTurn, type Reply } from "../../../core/order-conversation/take-turn.ts";
import { optionNames } from "../../../core/order-resolution/resolve-order.ts";
import { claimSession, deleteSession, loadDependencies, releaseSession } from "../../sessions.ts";
import { stepText } from "../../step-text.ts";
import type { TurnEvent } from "../../turn-events.ts";

const turnRequestSchema = z.object({ sessionId: z.string().nullable(), text: z.string() });

const NDJSON = { "Content-Type": "application/x-ndjson; charset=utf-8" };

function line(event: TurnEvent): string {
  return `${JSON.stringify(event)}\n`;
}

function answer(status: number, events: TurnEvent[]): Response {
  return new Response(events.map(line).join(""), { status, headers: NDJSON });
}

function replyEvent(reply: Reply): TurnEvent {
  switch (reply.kind) {
    case "ask":
      return { type: "questions", text: reply.text, questions: [] };
    case "questions":
      return {
        type: "questions",
        text: reply.text,
        questions: reply.items
          .flatMap((item) => (item.question === null ? [] : [optionNames(item.question)]))
          .map((options, index) => ({ number: index + 1, options })),
      };
    case "selection":
      return { type: "cart", cart: { ...reply.selection, paymentCard: reply.paymentCard } };
  }
}

function stepTracker(send: (event: TurnEvent) => void) {
  let nextId = 1;
  const running = new Map<string, { id: number; startedAt: number }[]>();
  return ({ status, step }: StepEvent) => {
    const key = JSON.stringify(step);
    const queue = running.get(key) ?? [];
    running.set(key, queue);
    if (status === "started") {
      const id = nextId++;
      queue.push({ id, startedAt: performance.now() });
      send({ type: "step-started", id, text: stepText(step) });
      return;
    }
    const started = queue.shift();
    if (!started) return;
    const seconds = (performance.now() - started.startedAt) / 1000;
    send({ type: "step-done", id: started.id, seconds });
  };
}

export async function POST(request: Request): Promise<Response> {
  const parsed = turnRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return answer(400, [{ type: "error", message: "El pedido al servidor no es válido." }]);
  }
  const dependencies = loadDependencies();
  if (!dependencies.ok) {
    return answer(500, [{ type: "error", message: dependencies.errors.join("\n") }]);
  }
  const claim = claimSession(parsed.data.sessionId);
  if (claim.kind === "missing") {
    return answer(404, [
      { type: "error", message: "La conversación ya no existe. Recargá la página para empezar." },
    ]);
  }
  if (claim.kind === "working") {
    return answer(409, [{ type: "error", message: "Todavía estoy trabajando en tu mensaje." }]);
  }
  const { sessionId, state, created } = claim;
  const { signal } = request;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: TurnEvent) => {
        if (signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(line(event)));
        } catch {
          return;
        }
      };
      if (created) send({ type: "session", sessionId });
      try {
        const turn = await takeTurn(
          state,
          parsed.data.text,
          { ...dependencies.value, signal },
          stepTracker(send),
        );
        if (turn.reply.kind === "selection") deleteSession(sessionId);
        else releaseSession(sessionId, turn.state);
        send(replyEvent(turn.reply));
      } catch (error) {
        if (signal.aborted) {
          releaseSession(sessionId, state);
        } else {
          deleteSession(sessionId);
          const message = error instanceof Error ? error.message : String(error);
          send({ type: "error", message });
        }
      }
      try {
        controller.close();
      } catch {
        return;
      }
    },
  });

  return new Response(stream, { headers: NDJSON });
}
