import { z } from "zod";
import {
  appendChatMessage,
  createAgentTools,
  createChatAgent,
  loadChatMessages,
  loadProfile,
} from "../../../compose.ts";
import { takeAgentTurn } from "../../../core/agent-chat/take-agent-turn.ts";

const requestSchema = z.object({ text: z.string().trim().min(1) });

const held = globalThis as typeof globalThis & { agentTurnRunning?: boolean };

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
  held.agentTurnRunning = true;
  try {
    const message = await takeAgentTurn(history.value, parsed.data.text, {
      agent,
      profile: profile.value,
      tools: createAgentTools(),
      save: appendChatMessage,
      now: () => new Date(),
      signal: request.signal,
    });
    return Response.json({ message });
  } catch (error) {
    return failure(500, [error instanceof Error ? error.message : String(error)]);
  } finally {
    held.agentTurnRunning = false;
  }
}
