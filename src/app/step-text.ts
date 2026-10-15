import type { Step } from "../core/order-conversation/steps.ts";

export function stepText(step: Step): string {
  switch (step.kind) {
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
