import type { Step, StepEvent } from "../core/order-conversation/steps.ts";
import type { TurnEvent } from "./turn-events.ts";

export function stepText(step: Step): string {
  switch (step.kind) {
    case "understand-message":
      return "Entendiendo tu mensaje";
    case "understand-order":
      return "Entendiendo el pedido";
    case "understand-answer":
      return "Interpretando tu respuesta";
    case "choose-products":
      return `Eligiendo productos para '${step.original}'`;
    case "simulate-cart":
      return "Carrefour: simulando el carrito";
  }
}

export function stepTurnEvent(event: StepEvent): TurnEvent {
  if (event.status === "started") {
    return { type: "step-started", id: event.id, text: stepText(event.step) };
  }
  return { type: "step-done", id: event.id, seconds: event.durationMs / 1000 };
}
