import { z } from "zod";
import {
  appendChatMessage,
  appendTurnLogEntry,
  createAgentTools,
  createChatAgent,
  loadChatMessages,
  loadOrders,
  loadProfile,
} from "../../../compose.ts";
import { openOrderOf } from "../../../core/agent-chat/order.ts";
import type { ToolsForTurn } from "../../../core/agent-chat/tools.ts";
import { takeAgentTurn } from "../../../core/agent-chat/take-agent-turn.ts";

const requestSchema = z.object({ text: z.string().trim().min(1) });

const held = globalThis as typeof globalThis & {
  agentTurnRunning?: boolean;
  agentTools?: { module: object; tools: ToolsForTurn };
};

const thisModule = {};

const agent = createChatAgent();

function failure(status: number, errors: string[]): Response {
  return Response.json({ errors }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure(400, ["El mensaje no es válido."]);
  if (held.agentTurnRunning) return failure(409, ["Todavía estoy trabajando en tu mensaje."]);
  const history = loadChatMessages();
  if (!history.ok) return failure(500, history.errors);
  const profile = loadProfile();
  if (!profile.ok) return failure(500, profile.errors);
  const orders = loadOrders();
  if (!orders.ok) return failure(500, orders.errors);
  if (held.agentTools?.module !== thisModule) {
    const tools = createAgentTools();
    if (!tools.ok) return failure(500, tools.errors);
    held.agentTools = { module: thisModule, tools: tools.value };
  }
  held.agentTurnRunning = true;
  try {
    const message = await takeAgentTurn(history.value, parsed.data.text, {
      agent,
      profile: profile.value,
      order: openOrderOf(orders.value),
      orders: orders.value,
      tools: held.agentTools.tools,
      save: appendChatMessage,
      now: () => new Date(),
      clock: () => performance.now(),
      saveTurnLog: appendTurnLogEntry,
      signal: request.signal,
    });
    return Response.json({ message });
  } catch (error) {
    return failure(500, [error instanceof Error ? error.message : String(error)]);
  } finally {
    held.agentTurnRunning = false;
  }
}
