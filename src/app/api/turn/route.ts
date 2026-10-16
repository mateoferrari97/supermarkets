import { z } from "zod";
import { loggedSteps, loggedTurn } from "../../../core/conversation-log/conversation-log.ts";
import { takeTurn, type Reply } from "../../../core/order-conversation/take-turn.ts";
import { claimSession, deleteSession, loadDependencies, releaseSession } from "../../sessions.ts";
import { stepTurnEvent } from "../../step-text.ts";
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
      return { type: "questions", text: reply.text, questions: reply.questions };
    case "plan":
      return {
        type: "plan",
        message: reply.message,
        plan: reply.plan,
        overBudget: reply.overBudget,
      };
    case "cart":
      return { type: "cart", cart: reply.cart };
  }
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
  const claim = claimSession(parsed.data.sessionId, dependencies.value);
  if (claim.kind === "missing") {
    return answer(404, [
      { type: "error", message: "La conversación ya no existe. Recargá la página para empezar." },
    ]);
  }
  if (claim.kind === "working") {
    return answer(409, [{ type: "error", message: "Todavía estoy trabajando en tu mensaje." }]);
  }
  const { sessionId, state, log, created } = claim;
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
        const logStep = loggedSteps(log.write);
        const turn = await loggedTurn(log.write, parsed.data.text, signal, () =>
          takeTurn(state, parsed.data.text, { ...log.dependencies, signal }, (event) => {
            logStep(event);
            send(stepTurnEvent(event));
          }),
        );
        releaseSession(sessionId, turn.state);
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
