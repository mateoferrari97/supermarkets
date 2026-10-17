import type { TurnLogEntry, TurnLogEvent } from "../core/agent-chat/turn-log.ts";

export const DEFAULT_TURNS = 10;
export const OWNER_TEXT_LENGTH = 40;

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const dollars = (usd: number): string => `$${usd.toFixed(4)}`;

const ownerTextStart = (text: string): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > OWNER_TEXT_LENGTH ? `${flat.slice(0, OWNER_TEXT_LENGTH).trimEnd()}…` : flat;
};

type ToolEvent = Extract<TurnLogEvent, { kind: "tool" }>;
type LlmCallEvent = Extract<TurnLogEvent, { kind: "llm-call" }>;

function agentLine({ agent }: TurnLogEntry): string {
  const wall = `agent ${seconds(agent.endMs - agent.startMs)} wall`;
  if (agent.reported === null) return `${wall}, session not reported`;
  const { durationMs, costUsd } = agent.reported;
  const reported = durationMs === null ? "no reported duration" : `${seconds(durationMs)} reported`;
  return costUsd === null ? `${wall}, ${reported}` : `${wall}, ${reported}, ${dollars(costUsd)}`;
}

function toolLine({ name, startMs, endMs, ok, error }: ToolEvent): string {
  const line = `${name} ${seconds(endMs - startMs)} (from ${seconds(startMs)} to ${seconds(endMs)})`;
  return ok ? line : `${line}, failed: ${error ?? "no error message"}`;
}

function fitProductsLine(calls: LlmCallEvent[]): string {
  const duration = calls.reduce((sum, call) => sum + call.durationMs, 0);
  const cost = calls.reduce((sum, call) => sum + call.costUsd, 0);
  const count = calls.length === 1 ? "1 call" : `${String(calls.length)} calls`;
  return `fit-products ${count}, ${seconds(duration)}, ${dollars(cost)}`;
}

export function formatTurn(entry: TurnLogEntry): string {
  const tools = entry.events.filter((event): event is ToolEvent => event.kind === "tool");
  const fitProducts = entry.events.filter(
    (event): event is LlmCallEvent => event.kind === "llm-call" && event.task === "fit-products",
  );
  return [
    `${entry.startedAt} ${entry.outcome} ${seconds(entry.durationMs)} "${ownerTextStart(entry.ownerText)}"`,
    ...(entry.error === null ? [] : [`  error: ${entry.error}`]),
    `  ${agentLine(entry)}`,
    ...[...tools].sort((a, b) => a.startMs - b.startMs).map((tool) => `  ${toolLine(tool)}`),
    ...(fitProducts.length === 0 ? [] : [`  ${fitProductsLine(fitProducts)}`]),
  ].join("\n");
}

export function formatTurns(entries: readonly TurnLogEntry[], last: number): string {
  const shown = entries.slice(-last);
  if (shown.length === 0) return "The Turn Log has no turns yet.";
  return shown.map(formatTurn).join("\n\n");
}
