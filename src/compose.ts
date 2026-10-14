import { createCarrefourStore } from "./adapters/carrefour/carrefour-store.ts";
import {
  createClaudeCodeLlm,
  type ClaudeCodeLlmOptions,
} from "./adapters/claude-code/claude-code-llm.ts";
import type { Llm } from "./core/order-resolution/llm.ts";
import type { OnlineStore } from "./core/product-selection/online-store.ts";

export type { LlmCall } from "./adapters/claude-code/claude-code-llm.ts";

export type LlmOptions = Omit<ClaudeCodeLlmOptions, "run">;

export function createLlm(options: LlmOptions): Llm {
  return createClaudeCodeLlm(options);
}

export function createOnlineStore(): OnlineStore {
  return createCarrefourStore();
}
