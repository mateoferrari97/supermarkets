import { z } from "zod";
import type { OnStep } from "../order-matching/steps.ts";

const milliseconds = z.number().nonnegative();

export const turnLogEventSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("tool"),
    name: z.string().min(1),
    startMs: milliseconds,
    endMs: milliseconds,
    ok: z.boolean(),
    error: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("step"),
    label: z.string().min(1),
    startMs: milliseconds,
    endMs: milliseconds,
  }),
  z.object({
    kind: z.literal("llm-call"),
    task: z.string().min(1),
    model: z.string().min(1),
    effort: z.string().nullable(),
    item: z.string().nullable(),
    endMs: milliseconds,
    durationMs: milliseconds,
    costUsd: z.number().nonnegative(),
  }),
]);

export type TurnLogEvent = z.infer<typeof turnLogEventSchema>;

export const agentSessionReportSchema = z.object({
  durationMs: milliseconds.nullable(),
  costUsd: z.number().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cacheReadTokens: z.number().int().nonnegative().nullable(),
  cacheWriteTokens: z.number().int().nonnegative().nullable(),
});

export type AgentSessionReport = z.infer<typeof agentSessionReportSchema>;

export const turnOutcomeKinds = ["replied", "ended-by-tool", "failed", "aborted"] as const;

export const turnLogEntrySchema = z.object({
  startedAt: z.iso.datetime(),
  ownerText: z.string(),
  durationMs: milliseconds,
  outcome: z.enum(turnOutcomeKinds),
  error: z.string().nullable(),
  agent: z.object({
    startMs: milliseconds,
    endMs: milliseconds,
    reported: agentSessionReportSchema.nullable(),
  }),
  events: z.array(turnLogEventSchema),
});

export type TurnLogEntry = z.infer<typeof turnLogEntrySchema>;

export type LlmCallReport = {
  task: string;
  model: string;
  effort: string | null;
  item: string | null;
  durationMs: number;
  costUsd: number;
};

export type TurnReporter = {
  onStep: OnStep;
  onLlmCall: (call: LlmCallReport) => void;
};

export const silentReporter: TurnReporter = {
  onStep: () => undefined,
  onLlmCall: () => undefined,
};

export type TurnClock = () => number;

export type SaveTurnLogEntry = (entry: TurnLogEntry) => void;
