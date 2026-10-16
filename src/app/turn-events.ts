import type { AskedQuestion, Cart, Mark } from "../core/order-conversation/take-turn.ts";

export type { AskedQuestion, Cart, Mark };

export type TurnEvent =
  | { type: "session"; sessionId: string }
  | { type: "step-started"; id: number; text: string }
  | { type: "step-done"; id: number; seconds: number }
  | { type: "questions"; text: string; questions: AskedQuestion[] }
  | { type: "cart"; cart: Cart }
  | { type: "error"; message: string };

export type TurnRequest = { sessionId: string | null; text: string };
