import type { Step } from "../core/order-conversation/steps.ts";

export function stepText(step: Step): string {
  switch (step.kind) {
    case "understand-order":
      return "Entendiendo el pedido";
    case "understand-answer":
      return "Interpretando tu respuesta";
    case "search-item":
      return `Buscando "${step.phrase}" en el catálogo`;
    case "translate-preference":
      return `Traduciendo "${step.preference}" a una política`;
    case "find-candidates":
      return `Carrefour: candidatos para "${step.phrase}"`;
    case "simulate-cart":
      return "Carrefour: simulando el carrito";
  }
}
