import type { ChatAgent } from "./agent.ts";
import { contextMessages, type ChatMessage } from "./chat.ts";
import { lastClosedOrders, type ChatOrder } from "./order.ts";
import type { Profile } from "./profile.ts";
import type { AgentTools, ToolsForTurn, TurnOutcome } from "./tool.ts";
import { stepLabel, type Step } from "../order-matching/steps.ts";
import type {
  AgentSessionReport,
  SaveTurnLogEntry,
  TurnClock,
  TurnLogEntry,
  TurnLogEvent,
  TurnReporter,
} from "./turn-log.ts";

export type AgentTurnDependencies = {
  agent: ChatAgent;
  profile: Profile | null;
  order: ChatOrder | null;
  orders?: ChatOrder[];
  tools: ToolsForTurn;
  save: (message: ChatMessage) => void;
  now: () => Date;
  clock: TurnClock;
  saveTurnLog: SaveTurnLogEntry;
  signal: AbortSignal;
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function timingTools(tools: AgentTools, elapsed: () => number, events: TurnLogEvent[]): AgentTools {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => [
      name,
      {
        ...tool,
        execute: async (input: unknown, signal: AbortSignal) => {
          const startMs = elapsed();
          try {
            const output = await tool.execute(input, signal);
            events.push({ kind: "tool", name, startMs, endMs: elapsed(), ok: true, error: null });
            return output;
          } catch (error) {
            events.push({
              kind: "tool",
              name,
              startMs,
              endMs: elapsed(),
              ok: false,
              error: messageOf(error),
            });
            throw error;
          }
        },
      },
    ]),
  );
}

export async function takeAgentTurn(
  history: ChatMessage[],
  text: string,
  {
    agent,
    profile,
    order,
    orders = [],
    tools,
    save,
    now,
    clock,
    saveTurnLog,
    signal,
  }: AgentTurnDependencies,
): Promise<ChatMessage> {
  const start = clock();
  const elapsed = () => Math.max(0, clock() - start);
  const ownerMessage: ChatMessage = { role: "owner", at: now().toISOString(), text };
  save(ownerMessage);
  const events: TurnLogEvent[] = [];
  const agentSpan = { startMs: elapsed(), endMs: elapsed() };
  let reported: AgentSessionReport | null = null;
  const stepStarts = new Map<Step, number>();
  const reporter: TurnReporter = {
    onStep: (event) => {
      if (event.status === "started") {
        stepStarts.set(event.step, elapsed());
        return;
      }
      const endMs = elapsed();
      const startMs = stepStarts.get(event.step) ?? endMs;
      stepStarts.delete(event.step);
      events.push({ kind: "step", label: stepLabel(event.step), startMs, endMs });
    },
    onLlmCall: (call) => {
      events.push({ kind: "llm-call", ...call, endMs: elapsed() });
    },
  };
  const log = (outcome: TurnLogEntry["outcome"], error: string | null) => {
    try {
      saveTurnLog({
        startedAt: ownerMessage.at,
        ownerText: text,
        durationMs: elapsed(),
        outcome,
        error,
        agent: { ...agentSpan, reported },
        events: [...events],
      });
    } catch {
      return;
    }
  };
  const outcome: TurnOutcome = { ended: null };
  try {
    agentSpan.startMs = elapsed();
    let reply: string;
    try {
      reply = await agent.reply(
        {
          messages: contextMessages([...history, ownerMessage]),
          profile,
          order,
          pastOrders: lastClosedOrders(orders),
          tools: timingTools(tools(outcome, [...history, ownerMessage], reporter), elapsed, events),
          turnEnded: () => outcome.ended !== null,
          reportSession: (report) => {
            reported = report;
          },
        },
        signal,
      );
    } finally {
      agentSpan.endMs = elapsed();
    }
    const at = now().toISOString();
    const assistantMessage: ChatMessage =
      outcome.ended === null
        ? { role: "assistant", at, text: reply }
        : { role: "assistant", at, text: outcome.ended.text, parts: outcome.ended.parts };
    save(assistantMessage);
    log(outcome.ended === null ? "replied" : "ended-by-tool", null);
    return assistantMessage;
  } catch (error) {
    log(signal.aborted ? "aborted" : "failed", messageOf(error));
    throw error;
  }
}
