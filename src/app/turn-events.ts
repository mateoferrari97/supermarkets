import type { Cart } from "../core/order-conversation/take-turn.ts";

export type AskedQuestion = { number: number; options: string[] };

export type { Cart };

export type TurnEvent =
  | { type: "session"; sessionId: string }
  | { type: "step-started"; id: number; text: string }
  | { type: "step-done"; id: number; seconds: number }
  | { type: "questions"; text: string; questions: AskedQuestion[] }
  | { type: "cart"; cart: Cart }
  | { type: "error"; message: string };

export type TurnRequest = { sessionId: string | null; text: string };
